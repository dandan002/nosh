import "server-only";

import type Stripe from "stripe";

import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import { computeCheckBreakdown, isCheckFullyPaid, type SplitMode } from "@/lib/billing/split";

// Shared by the Stripe webhook (app/api/stripe/webhook/route.ts) and the
// client-triggered "sync" after Stripe.js confirms a payment
// (lib/actions/billing.ts → syncPayment). Both paths only ever act on a
// PaymentIntent fetched from / signed by Stripe, never on client-supplied
// status, and every write here is idempotent — whichever path arrives
// first does the work and the other is a no-op.

type PaymentRow = {
  id: string;
  check_id: string;
  status: string;
};

function mapIntentStatus(
  intent: Stripe.PaymentIntent,
  failureEvent: boolean,
): "pending" | "succeeded" | "failed" | "canceled" {
  switch (intent.status) {
    case "succeeded":
      return "succeeded";
    case "canceled":
      return "canceled";
    case "requires_payment_method":
      // A fresh intent also sits in requires_payment_method; only treat it
      // as failed when Stripe told us an attempt actually failed.
      return failureEvent || intent.last_payment_error ? "failed" : "pending";
    default:
      return "pending";
  }
}

function cardDetails(intent: Stripe.PaymentIntent): { brand: string | null; last4: string | null } {
  const charge = intent.latest_charge;
  if (!charge || typeof charge === "string") return { brand: null, last4: null };
  const card = charge.payment_method_details?.card;
  return { brand: card?.brand ?? null, last4: card?.last4 ?? null };
}

export async function applyPaymentIntent(
  intentOrId: Stripe.PaymentIntent | string,
  { failureEvent = false }: { failureEvent?: boolean } = {},
): Promise<{ paymentId: string | null; status: string | null }> {
  const stripe = getStripe();
  // Always re-retrieve (expanding the charge for card brand/last4) rather
  // than trusting a possibly stale event payload.
  const intentId = typeof intentOrId === "string" ? intentOrId : intentOrId.id;
  const intent = await stripe.paymentIntents.retrieve(intentId, { expand: ["latest_charge"] });

  const admin = createAdminClient();
  const { data: payment, error } = await admin
    .from("payments")
    .select("id, check_id, status")
    .eq("stripe_payment_intent_id", intent.id)
    .maybeSingle<PaymentRow>();

  if (error) throw new Error(`Failed to load payment: ${error.message}`);
  // Not one of ours (or created by a different deployment) — nothing to do.
  if (!payment) return { paymentId: null, status: null };

  const nextStatus = mapIntentStatus(intent, failureEvent);

  // Never downgrade a terminal state (e.g. a late payment_failed for an
  // attempt that was later retried and succeeded).
  if (payment.status === "succeeded" || payment.status === "refunded") {
    if (payment.status === "succeeded") await settleCheckIfFullyPaid(payment.check_id);
    return { paymentId: payment.id, status: payment.status };
  }

  if (nextStatus !== payment.status) {
    const { brand, last4 } = cardDetails(intent);
    const { error: updateError } = await admin
      .from("payments")
      .update({
        status: nextStatus,
        succeeded_at: nextStatus === "succeeded" ? new Date().toISOString() : null,
        card_brand: brand,
        card_last4: last4,
      })
      .eq("id", payment.id)
      .neq("status", "succeeded");

    if (updateError) throw new Error(`Failed to update payment: ${updateError.message}`);
  }

  if (nextStatus === "succeeded") {
    await settleCheckIfFullyPaid(payment.check_id);
  }

  return { paymentId: payment.id, status: nextStatus };
}

export async function markPaymentRefunded(intentId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("payments")
    .update({ status: "refunded" })
    .eq("stripe_payment_intent_id", intentId)
    .eq("status", "succeeded");
  if (error) throw new Error(`Failed to mark payment refunded: ${error.message}`);
}

// Marks the check paid, closes the table session, and flips the table to
// "dirty" (needs bussing) once every portion that owes money has a
// succeeded payment. Safe to call repeatedly.
export async function settleCheckIfFullyPaid(checkId: string): Promise<boolean> {
  const admin = createAdminClient();

  const { data: check, error } = await admin
    .from("checks")
    .select(
      `id, status, split_mode, split_count, tax_rate_bps, table_session_id,
       check_items ( id, amount_cents, split_group ),
       payments ( split_group, status )`,
    )
    .eq("id", checkId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load check: ${error.message}`);
  if (!check) return false;
  if (check.status === "paid") return true;
  if (check.status !== "open") return false;

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

  const paidGroups = check.payments
    .filter((p: { status: string }) => p.status === "succeeded")
    .map((p: { split_group: number }) => p.split_group);

  if (!isCheckFullyPaid(breakdown, paidGroups)) return false;

  return closeCheck(check.id, check.table_session_id);
}

// Used both for a fully-paid check and for a zero-total check (everything
// comped/unsent) that has nothing to collect.
export async function closeCheck(checkId: string, sessionId: string): Promise<boolean> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: closed, error: checkError } = await admin
    .from("checks")
    .update({ status: "paid", closed_at: now })
    .eq("id", checkId)
    .eq("status", "open")
    .select("id");
  if (checkError) throw new Error(`Failed to close check: ${checkError.message}`);
  // Someone else already closed it — they also handled the session/table.
  if (!closed || closed.length === 0) return true;

  const { data: session, error: sessionError } = await admin
    .from("table_sessions")
    .update({ status: "closed", closed_at: now })
    .eq("id", sessionId)
    .eq("status", "active")
    .select("table_id");
  if (sessionError) throw new Error(`Failed to close session: ${sessionError.message}`);

  const tableId = session?.[0]?.table_id;
  if (tableId) {
    const { error: tableError } = await admin
      .from("tables")
      .update({ status: "dirty" })
      .eq("id", tableId);
    if (tableError) throw new Error(`Failed to update table: ${tableError.message}`);
  }

  return true;
}

// Best-effort: cancels any still-pending PaymentIntents for a check (or
// one portion of it) — used when a split changes or a portion is retried,
// so a stale intent for an outdated amount can't be completed later.
export async function cancelPendingPayments(checkId: string, splitGroup?: number): Promise<void> {
  const admin = createAdminClient();
  let query = admin
    .from("payments")
    .select("id, stripe_payment_intent_id")
    .eq("check_id", checkId)
    .eq("status", "pending");
  if (splitGroup !== undefined) query = query.eq("split_group", splitGroup);

  const { data: pending, error } = await query;
  if (error) throw new Error(`Failed to load pending payments: ${error.message}`);
  if (!pending || pending.length === 0) return;

  const stripe = getStripe();
  for (const payment of pending) {
    if (payment.stripe_payment_intent_id) {
      try {
        await stripe.paymentIntents.cancel(payment.stripe_payment_intent_id);
      } catch {
        // Already succeeded/canceled on Stripe's side — re-sync instead of
        // blindly marking it canceled.
        await applyPaymentIntent(payment.stripe_payment_intent_id);
        continue;
      }
    }
    await admin
      .from("payments")
      .update({ status: "canceled" })
      .eq("id", payment.id)
      .eq("status", "pending");
  }
}

// Mirrors a Connect account's onboarding state onto
// restaurant_stripe_accounts. Called from the account.updated webhook and
// the settings page's "refresh status" action — always with values read
// from Stripe, never from the browser. Lives here (a server-only module)
// rather than in lib/actions so it can't be invoked as a Server Action.
export async function syncStripeAccount(
  stripeAccountId: string,
  state: { chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean },
): Promise<void> {
  const { error } = await createAdminClient()
    .from("restaurant_stripe_accounts")
    .update({
      charges_enabled: state.chargesEnabled,
      payouts_enabled: state.payoutsEnabled,
      details_submitted: state.detailsSubmitted,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_account_id", stripeAccountId);
  if (error) throw new Error(error.message);
}
