"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getRestaurantForSlug,
  isServerOrAbove,
  type StaffRole,
} from "@/lib/data/restaurant";
import { BILLING_CURRENCY, getStripe, isStripeConfigured, platformFeeBps } from "@/lib/stripe/server";
import { getSiteUrl } from "@/lib/site-url";
import {
  applicationFeeFor,
  computeCheckBreakdown,
  type SplitMode,
} from "@/lib/billing/split";
import {
  applyPaymentIntent,
  cancelPendingPayments,
  closeCheck,
  syncStripeAccount,
} from "@/lib/billing/finalize";
import {
  AssignItemSchema,
  CreatePaymentSchema,
  SplitConfigSchema,
  TaxRateSchema,
} from "@/lib/validations/billing";

export type BillingActionState =
  | {
      error?: string;
      success?: string;
      fieldErrors?: Record<string, string[]>;
    }
  | undefined;

// Conventions: every action resolves the restaurant + caller's role from
// the slug server-side (never trusting a client-supplied restaurant id),
// reads through the caller's RLS-scoped client so tenancy is enforced by
// Postgres, and only reaches for the service-role client for the writes
// 0005_billing.sql deliberately keeps away from the authenticated role.

function isOwnerOrAdmin(role: StaffRole): boolean {
  return role === "owner" || role === "admin";
}

function billingPaths(slug: string, checkId?: string) {
  revalidatePath(`/${slug}/billing`);
  if (checkId) revalidatePath(`/${slug}/billing/${checkId}`);
}

// -- Settings: tax rate ------------------------------------------------------

export async function updateTaxRate(
  restaurantSlug: string,
  _prevState: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const { restaurant, staffMember } = await getRestaurantForSlug(restaurantSlug);
  if (!isOwnerOrAdmin(staffMember.role)) {
    return { error: "Only owners and admins can change the tax rate." };
  }

  const validated = TaxRateSchema.safeParse({ taxRatePercent: formData.get("taxRatePercent") });
  if (!validated.success) {
    return { fieldErrors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("restaurants")
    .update({ tax_rate_bps: Math.round(validated.data.taxRatePercent * 100) })
    .eq("id", restaurant.id)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Not permitted." };

  revalidatePath(`/${restaurantSlug}/admin/settings`);
  return { success: "Tax rate saved. It applies to checks generated from now on." };
}

// -- Settings: Stripe Connect Express onboarding (#9) -----------------------

async function requireStripeAdmin(restaurantSlug: string) {
  const { restaurant, staffMember } = await getRestaurantForSlug(restaurantSlug);
  if (!isOwnerOrAdmin(staffMember.role)) {
    throw new Error("Only owners and admins can manage payouts.");
  }
  if (!isStripeConfigured()) {
    throw new Error("Stripe isn't configured for this deployment (STRIPE_SECRET_KEY).");
  }
  return restaurant;
}

export async function startStripeOnboarding(restaurantSlug: string): Promise<BillingActionState> {
  let url: string;
  try {
    const restaurant = await requireStripeAdmin(restaurantSlug);
    const stripe = getStripe();
    const admin = createAdminClient();

    const { data: existing, error } = await admin
      .from("restaurant_stripe_accounts")
      .select("stripe_account_id")
      .eq("restaurant_id", restaurant.id)
      .maybeSingle();
    if (error) return { error: error.message };

    let accountId = existing?.stripe_account_id;
    if (!accountId) {
      const account = await stripe.accounts.create(
        {
          type: "express",
          business_profile: { name: restaurant.name },
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          metadata: { restaurant_id: restaurant.id },
        },
        // Two owners clicking at once shouldn't create two accounts.
        { idempotencyKey: `connect-account-${restaurant.id}` },
      );
      accountId = account.id;

      const { error: insertError } = await admin.from("restaurant_stripe_accounts").insert({
        restaurant_id: restaurant.id,
        stripe_account_id: accountId,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
      });
      // A concurrent request won the insert; fine, the idempotency key
      // means it stored the same account id.
      if (insertError && insertError.code !== "23505") return { error: insertError.message };
    }

    const siteUrl = await getSiteUrl();
    const settingsUrl = `${siteUrl}/${restaurantSlug}/admin/settings`;
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${settingsUrl}?stripe=refresh`,
      return_url: `${settingsUrl}?stripe=return`,
    });
    url = link.url;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't start Stripe onboarding." };
  }
  redirect(url);
}

// Called when the owner lands back from Stripe's hosted onboarding (and
// from a "Refresh status" button) — the account.updated webhook keeps this
// in sync too, but this means status is correct immediately even if
// webhooks aren't configured yet.
export async function refreshStripeAccountStatus(
  restaurantSlug: string,
): Promise<BillingActionState> {
  try {
    const { restaurant } = await getRestaurantForSlug(restaurantSlug);
    if (!isStripeConfigured()) return { error: "Stripe isn't configured for this deployment." };

    const admin = createAdminClient();
    const { data: existing, error } = await admin
      .from("restaurant_stripe_accounts")
      .select("stripe_account_id")
      .eq("restaurant_id", restaurant.id)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!existing) return { error: "No Stripe account yet — start onboarding first." };

    const account = await getStripe().accounts.retrieve(existing.stripe_account_id);
    await syncStripeAccount(account.id, {
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't refresh Stripe status." };
  }
  revalidatePath(`/${restaurantSlug}/admin/settings`);
  return { success: "Stripe status refreshed." };
}

export async function openStripeDashboard(restaurantSlug: string): Promise<BillingActionState> {
  let url: string;
  try {
    const restaurant = await requireStripeAdmin(restaurantSlug);
    const { data: existing, error } = await createAdminClient()
      .from("restaurant_stripe_accounts")
      .select("stripe_account_id")
      .eq("restaurant_id", restaurant.id)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!existing) return { error: "No Stripe account yet." };
    const link = await getStripe().accounts.createLoginLink(existing.stripe_account_id);
    url = link.url;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't open the Stripe dashboard." };
  }
  redirect(url);
}

// -- Check generation (#10) ---------------------------------------------------

type OrderItemForCheck = {
  id: string;
  quantity: number;
  unit_price_cents: number;
  notes: string | null;
  menu_items: { name: string } | null;
  order_item_modifiers: { price_delta_cents: number; modifiers: { name: string } | null }[];
};

async function generateCheckForSession(
  restaurantId: string,
  sessionId: string,
  staffMemberId: string,
): Promise<{ checkId?: string; error?: string }> {
  const supabase = await createClient();

  const [{ data: session, error: sessionError }, { data: restaurantRow, error: restaurantError }] =
    await Promise.all([
      supabase
        .from("table_sessions")
        .select("id, status")
        .eq("id", sessionId)
        .eq("restaurant_id", restaurantId)
        .maybeSingle(),
      supabase.from("restaurants").select("tax_rate_bps").eq("id", restaurantId).single(),
    ]);

  if (sessionError || restaurantError) {
    return { error: (sessionError ?? restaurantError)!.message };
  }
  if (!session) return { error: "Table session not found." };
  if (session.status !== "active") return { error: "This table has already been closed out." };

  // Every non-cancelled item that actually went to the kitchen, across all
  // of this session's orders.
  const { data: orderItems, error: itemsError } = await supabase
    .from("order_items")
    .select(
      `id, quantity, unit_price_cents, notes, created_at,
       menu_items ( name ),
       order_item_modifiers ( price_delta_cents, modifiers ( name ) ),
       orders!inner ( table_session_id )`,
    )
    .eq("restaurant_id", restaurantId)
    .eq("orders.table_session_id", sessionId)
    .in("status", ["fired", "preparing", "ready", "delivered"])
    .order("created_at", { ascending: true });

  if (itemsError) return { error: itemsError.message };
  if (!orderItems || orderItems.length === 0) {
    return { error: "Nothing has been ordered for this table yet." };
  }

  // One check_items row per unit (see 0005_billing.sql) so splits can put
  // each unit on a different portion.
  const lines: {
    order_item_id: string;
    description: string;
    modifiers_summary: string | null;
    amount_cents: number;
  }[] = [];
  for (const raw of orderItems as unknown as OrderItemForCheck[]) {
    const modifierTotal = raw.order_item_modifiers.reduce((s, m) => s + m.price_delta_cents, 0);
    const modifierNames = raw.order_item_modifiers
      .map((m) => m.modifiers?.name)
      .filter(Boolean)
      .join(", ");
    for (let unit = 0; unit < raw.quantity; unit++) {
      lines.push({
        order_item_id: raw.id,
        description: raw.menu_items?.name ?? "Item",
        modifiers_summary: modifierNames || null,
        amount_cents: raw.unit_price_cents + modifierTotal,
      });
    }
  }

  const taxRateBps = restaurantRow.tax_rate_bps;
  const breakdown = computeCheckBreakdown({
    lines: lines.map((line, i) => ({ id: String(i), amountCents: line.amount_cents, splitGroup: null })),
    taxRateBps,
    splitMode: "none",
    splitCount: 1,
  });

  // Client-generated id so the check_items insert doesn't need a
  // read-back (same approach as onboarding's restaurant insert).
  const checkId = randomUUID();
  const { error: checkError } = await supabase.from("checks").insert({
    id: checkId,
    restaurant_id: restaurantId,
    table_session_id: sessionId,
    created_by: staffMemberId,
    tax_rate_bps: taxRateBps,
    subtotal_cents: breakdown.subtotalCents,
    tax_cents: breakdown.taxCents,
    total_cents: breakdown.totalCents,
  });

  if (checkError) {
    // checks_one_open_per_session_idx: someone else just generated one.
    if (checkError.code === "23505") {
      const { data: open } = await supabase
        .from("checks")
        .select("id")
        .eq("table_session_id", sessionId)
        .eq("status", "open")
        .maybeSingle();
      if (open) return { checkId: open.id };
    }
    return { error: checkError.message };
  }

  const { error: insertItemsError } = await supabase.from("check_items").insert(
    lines.map((line, i) => ({ ...line, restaurant_id: restaurantId, check_id: checkId, sort_order: i })),
  );
  if (insertItemsError) {
    // Don't leave a half-built open check blocking the session.
    await supabase.from("checks").update({ status: "void" }).eq("id", checkId);
    return { error: insertItemsError.message };
  }

  return { checkId };
}

// Opens the session's existing open check, or generates one.
export async function openCheckForSession(
  restaurantSlug: string,
  sessionId: string,
): Promise<BillingActionState> {
  const { restaurant, staffMember } = await getRestaurantForSlug(restaurantSlug);
  if (!isServerOrAbove(staffMember.role)) return { error: "Only servers and above can run checks." };

  const supabase = await createClient();
  const { data: open, error } = await supabase
    .from("checks")
    .select("id")
    .eq("restaurant_id", restaurant.id)
    .eq("table_session_id", sessionId)
    .eq("status", "open")
    .maybeSingle();
  if (error) return { error: error.message };

  let checkId = open?.id;
  if (!checkId) {
    const result = await generateCheckForSession(restaurant.id, sessionId, staffMember.id);
    if (result.error) return { error: result.error };
    checkId = result.checkId!;
  }

  billingPaths(restaurantSlug, checkId);
  redirect(`/${restaurantSlug}/billing/${checkId}`);
}

// Rebuilds a check from the current order_items (e.g. more was ordered
// after the check was printed). Only allowed before any payment has
// succeeded against it.
export async function regenerateCheck(
  restaurantSlug: string,
  checkId: string,
): Promise<BillingActionState> {
  const { restaurant, staffMember } = await getRestaurantForSlug(restaurantSlug);
  if (!isServerOrAbove(staffMember.role)) return { error: "Only servers and above can run checks." };

  const supabase = await createClient();
  const { data: check, error } = await supabase
    .from("checks")
    .select("id, status, table_session_id, payments ( status )")
    .eq("id", checkId)
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!check || check.status !== "open") return { error: "This check is no longer open." };
  if (check.payments.some((p: { status: string }) => p.status === "succeeded")) {
    return { error: "A payment has already been taken on this check, so it can't be rebuilt." };
  }

  try {
    await cancelPendingPayments(checkId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't cancel pending payments." };
  }

  const { data: voided, error: voidError } = await supabase
    .from("checks")
    .update({ status: "void", closed_at: new Date().toISOString() })
    .eq("id", checkId)
    .eq("status", "open")
    .select("id");
  if (voidError) return { error: voidError.message };
  if (!voided || voided.length === 0) return { error: "This check already changed — refresh." };

  const result = await generateCheckForSession(restaurant.id, check.table_session_id, staffMember.id);
  if (result.error) return { error: result.error };

  billingPaths(restaurantSlug, checkId);
  redirect(`/${restaurantSlug}/billing/${result.checkId}`);
}

// -- Split billing (#12) -------------------------------------------------------

async function loadOpenCheckForEdit(restaurantId: string, checkId: string) {
  const supabase = await createClient();
  const { data: check, error } = await supabase
    .from("checks")
    .select("id, status, split_mode, split_count, payments ( status )")
    .eq("id", checkId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!check || check.status !== "open") return { error: "This check is no longer open." };
  if (check.payments.some((p: { status: string }) => p.status === "succeeded")) {
    return { error: "A payment has already been taken, so the split is locked." };
  }
  return { check, supabase };
}

export async function updateCheckSplit(
  restaurantSlug: string,
  checkId: string,
  splitMode: SplitMode,
  splitCount: number,
): Promise<BillingActionState> {
  const { restaurant, staffMember } = await getRestaurantForSlug(restaurantSlug);
  if (!isServerOrAbove(staffMember.role)) return { error: "Only servers and above can split checks." };

  const validated = SplitConfigSchema.safeParse({ splitMode, splitCount });
  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? "Invalid split." };
  }
  const mode = validated.data.splitMode as SplitMode;
  const count = mode === "none" ? 1 : validated.data.splitCount;

  const loaded = await loadOpenCheckForEdit(restaurant.id, checkId);
  if ("error" in loaded) return { error: loaded.error };
  const { check, supabase } = loaded;

  try {
    // Outstanding intents were priced for the old split.
    await cancelPendingPayments(checkId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't cancel pending payments." };
  }

  const { error } = await supabase
    .from("checks")
    .update({ split_mode: mode, split_count: count })
    .eq("id", checkId);
  if (error) return { error: error.message };

  // Item assignments only mean something for by_seat/by_item, and only
  // within the same mode — switching modes starts assignment over;
  // shrinking the count unassigns items that were on removed portions.
  const assignmentsUsed = mode === "by_seat" || mode === "by_item";
  if (!assignmentsUsed || check.split_mode !== mode) {
    const { error: clearError } = await supabase
      .from("check_items")
      .update({ split_group: null })
      .eq("check_id", checkId);
    if (clearError) return { error: clearError.message };
  } else if (count < check.split_count) {
    const { error: clearError } = await supabase
      .from("check_items")
      .update({ split_group: null })
      .eq("check_id", checkId)
      .gt("split_group", count);
    if (clearError) return { error: clearError.message };
  }

  billingPaths(restaurantSlug, checkId);
}

export async function assignCheckItem(
  restaurantSlug: string,
  checkId: string,
  checkItemId: string,
  splitGroup: number | null,
): Promise<BillingActionState> {
  const { restaurant, staffMember } = await getRestaurantForSlug(restaurantSlug);
  if (!isServerOrAbove(staffMember.role)) return { error: "Only servers and above can split checks." };

  const validated = AssignItemSchema.safeParse({ checkItemId, splitGroup });
  if (!validated.success) return { error: "Invalid assignment." };

  const loaded = await loadOpenCheckForEdit(restaurant.id, checkId);
  if ("error" in loaded) return { error: loaded.error };
  const { check, supabase } = loaded;

  if (check.split_mode !== "by_seat" && check.split_mode !== "by_item") {
    return { error: "Items are only assigned when splitting by seat or by item." };
  }
  if (splitGroup !== null && splitGroup > check.split_count) {
    return { error: "That portion doesn't exist." };
  }

  try {
    await cancelPendingPayments(checkId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't cancel pending payments." };
  }

  const { data, error } = await supabase
    .from("check_items")
    .update({ split_group: validated.data.splitGroup })
    .eq("id", validated.data.checkItemId)
    .eq("check_id", checkId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Item not found or not permitted." };

  billingPaths(restaurantSlug, checkId);
}

// -- Payment collection (#11) + tips (#13) -------------------------------------

export type CreatePaymentResult =
  | { error: string; clientSecret?: undefined; paymentId?: undefined }
  | { clientSecret: string; paymentId: string; totalCents: number; error?: undefined };

export async function createPayment(
  restaurantSlug: string,
  input: { checkId: string; splitGroup: number; tipCents: number; receiptEmail?: string },
): Promise<CreatePaymentResult> {
  const { restaurant, staffMember } = await getRestaurantForSlug(restaurantSlug);
  if (!isServerOrAbove(staffMember.role)) return { error: "Only servers and above can take payment." };
  if (!isStripeConfigured()) return { error: "Stripe isn't configured for this deployment." };

  const validated = CreatePaymentSchema.safeParse(input);
  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? "Invalid payment." };
  }
  const { checkId, splitGroup, tipCents } = validated.data;
  const receiptEmail = validated.data.receiptEmail || null;

  const supabase = await createClient();
  const [{ data: check, error }, { data: account, error: accountError }] = await Promise.all([
    supabase
      .from("checks")
      .select(
        `id, status, split_mode, split_count, tax_rate_bps,
         check_items ( id, amount_cents, split_group ),
         payments ( split_group, status )`,
      )
      .eq("id", checkId)
      .eq("restaurant_id", restaurant.id)
      .maybeSingle(),
    supabase
      .from("restaurant_stripe_accounts")
      .select("stripe_account_id, charges_enabled")
      .eq("restaurant_id", restaurant.id)
      .maybeSingle(),
  ]);

  if (error || accountError) return { error: (error ?? accountError)!.message };
  if (!check || check.status !== "open") return { error: "This check is no longer open." };
  // Gate on Connect onboarding (#9): no destination to pay out to yet.
  if (!account || !account.charges_enabled) {
    return { error: "Card payments aren't enabled yet — finish Stripe onboarding in Settings." };
  }

  // The amount is always recomputed here from the stored check items —
  // the client only says which portion and how much tip.
  const breakdown = computeCheckBreakdown({
    lines: check.check_items.map((item: { id: string; amount_cents: number; split_group: number | null }) => ({
      id: item.id,
      amountCents: item.amount_cents,
      splitGroup: item.split_group,
    })),
    taxRateBps: check.tax_rate_bps,
    splitMode: check.split_mode as SplitMode,
    splitCount: check.split_count,
  });

  if (breakdown.unassignedItemIds.length > 0) {
    return { error: "Assign every item to a seat/guest before taking payment." };
  }
  const portion = breakdown.portions.find((p) => p.group === splitGroup);
  if (!portion) return { error: "That portion doesn't exist." };
  if (portion.totalCents <= 0) return { error: "Nothing to pay on this portion." };
  if (
    check.payments.some(
      (p: { split_group: number; status: string }) =>
        p.split_group === splitGroup && p.status === "succeeded",
    )
  ) {
    return { error: "This portion has already been paid." };
  }
  if (tipCents > portion.totalCents * 2 && tipCents > 10_000) {
    return { error: "That tip looks too large — double-check the amount." };
  }

  try {
    // Only one live intent per portion.
    await cancelPendingPayments(checkId, splitGroup);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't cancel a previous attempt." };
  }

  const paymentId = randomUUID();
  const amountCents = portion.totalCents;
  const totalCents = amountCents + tipCents;
  const applicationFeeCents = applicationFeeFor(amountCents, platformFeeBps());

  let intent;
  try {
    // Destination charge: the platform creates the charge, Stripe
    // transfers it to the restaurant's Connect account minus
    // application_fee_amount.
    intent = await getStripe().paymentIntents.create(
      {
        amount: totalCents,
        currency: BILLING_CURRENCY,
        // In-person, staff-driven flow: card-style methods only, no
        // redirect-based methods that would navigate away from the check.
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        application_fee_amount: applicationFeeCents,
        transfer_data: { destination: account.stripe_account_id },
        receipt_email: receiptEmail ?? undefined,
        description: `${restaurant.name} — check ${checkId.slice(0, 8)}`,
        metadata: {
          payment_id: paymentId,
          check_id: checkId,
          restaurant_id: restaurant.id,
          split_group: String(splitGroup),
        },
      },
      { idempotencyKey: `payment-${paymentId}` },
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Stripe rejected the payment." };
  }

  const { error: insertError } = await createAdminClient().from("payments").insert({
    id: paymentId,
    restaurant_id: restaurant.id,
    check_id: checkId,
    split_group: splitGroup,
    amount_cents: amountCents,
    tip_cents: tipCents,
    total_cents: totalCents,
    application_fee_cents: applicationFeeCents,
    currency: BILLING_CURRENCY,
    status: "pending",
    stripe_payment_intent_id: intent.id,
    receipt_email: receiptEmail,
    created_by: staffMember.id,
  });

  if (insertError) {
    await getStripe().paymentIntents.cancel(intent.id).catch(() => undefined);
    return { error: insertError.message };
  }

  return { clientSecret: intent.client_secret!, paymentId, totalCents };
}

// Called by the payment form right after Stripe.js confirms, so the UI
// doesn't have to wait on webhook delivery. Re-reads the PaymentIntent from
// Stripe — never trusts a status from the browser.
export async function syncPayment(
  restaurantSlug: string,
  paymentId: string,
): Promise<BillingActionState & { status?: string }> {
  const { restaurant } = await getRestaurantForSlug(restaurantSlug);

  const supabase = await createClient();
  const { data: payment, error } = await supabase
    .from("payments")
    .select("id, check_id, stripe_payment_intent_id")
    .eq("id", paymentId)
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!payment?.stripe_payment_intent_id) return { error: "Payment not found." };

  try {
    const result = await applyPaymentIntent(payment.stripe_payment_intent_id);
    billingPaths(restaurantSlug, payment.check_id);
    return { status: result.status ?? undefined };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't confirm payment status." };
  }
}

// A check whose total is $0 (everything unsent/comped) has nothing to
// collect — close it out directly.
export async function closeZeroCheck(
  restaurantSlug: string,
  checkId: string,
): Promise<BillingActionState> {
  const { restaurant, staffMember } = await getRestaurantForSlug(restaurantSlug);
  if (!isServerOrAbove(staffMember.role)) return { error: "Only servers and above can close checks." };

  const supabase = await createClient();
  const { data: check, error } = await supabase
    .from("checks")
    .select("id, status, total_cents, table_session_id")
    .eq("id", checkId)
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!check || check.status !== "open") return { error: "This check is no longer open." };
  if (check.total_cents !== 0) return { error: "This check still has a balance." };

  try {
    await closeCheck(check.id, check.table_session_id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't close the check." };
  }
  billingPaths(restaurantSlug, checkId);
}
