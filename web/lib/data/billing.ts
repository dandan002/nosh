import "server-only";

import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { SplitMode } from "@/lib/billing/split";

// -- Restaurant billing settings ------------------------------------------

export type StripeAccountState = {
  stripeAccountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
};

export type BillingSettings = {
  taxRateBps: number;
  stripeAccount: StripeAccountState | null;
};

export async function getBillingSettings(restaurantId: string): Promise<BillingSettings> {
  const supabase = await createClient();

  const [{ data: restaurant, error }, { data: account, error: accountError }] = await Promise.all([
    supabase.from("restaurants").select("tax_rate_bps").eq("id", restaurantId).single(),
    supabase
      .from("restaurant_stripe_accounts")
      .select("stripe_account_id, charges_enabled, payouts_enabled, details_submitted")
      .eq("restaurant_id", restaurantId)
      .maybeSingle(),
  ]);

  if (error || accountError) {
    throw new Error(`Failed to load billing settings: ${(error ?? accountError)!.message}`);
  }

  return {
    taxRateBps: restaurant.tax_rate_bps,
    stripeAccount: account
      ? {
          stripeAccountId: account.stripe_account_id,
          chargesEnabled: account.charges_enabled,
          payoutsEnabled: account.payouts_enabled,
          detailsSubmitted: account.details_submitted,
        }
      : null,
  };
}

// -- Billing overview (open tables + recently closed checks) ---------------

export type BillableSession = {
  id: string;
  tableLabel: string;
  partySize: number;
  openedAt: string;
  openCheck: { id: string; totalCents: number } | null;
};

export type ClosedCheckSummary = {
  id: string;
  tableLabel: string;
  totalCents: number;
  closedAt: string;
};

export async function getBillingOverview(restaurantId: string): Promise<{
  sessions: BillableSession[];
  recentlyClosed: ClosedCheckSummary[];
}> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [{ data: sessions, error }, { data: closed, error: closedError }] = await Promise.all([
    supabase
      .from("table_sessions")
      .select(`id, party_size, opened_at, tables ( label ), checks ( id, status, total_cents )`)
      .eq("restaurant_id", restaurantId)
      .eq("status", "active")
      .order("opened_at", { ascending: true }),
    supabase
      .from("checks")
      .select(`id, total_cents, closed_at, table_sessions ( tables ( label ) )`)
      .eq("restaurant_id", restaurantId)
      .eq("status", "paid")
      .gte("closed_at", since)
      .order("closed_at", { ascending: false })
      .limit(20),
  ]);

  if (error || closedError) {
    throw new Error(`Failed to load billing overview: ${(error ?? closedError)!.message}`);
  }

  return {
    sessions: sessions.map((session) => {
      const open = session.checks.find((c: { status: string }) => c.status === "open") as
        | { id: string; total_cents: number }
        | undefined;
      return {
        id: session.id,
        tableLabel: (session.tables as unknown as { label: string }).label,
        partySize: session.party_size,
        openedAt: session.opened_at,
        openCheck: open ? { id: open.id, totalCents: open.total_cents } : null,
      };
    }),
    recentlyClosed: closed.map((check) => ({
      id: check.id,
      tableLabel: (check.table_sessions as unknown as { tables: { label: string } }).tables.label,
      totalCents: check.total_cents,
      closedAt: check.closed_at!,
    })),
  };
}

// -- Check detail ----------------------------------------------------------

export type CheckItem = {
  id: string;
  description: string;
  modifiersSummary: string | null;
  amountCents: number;
  splitGroup: number | null;
};

export type CheckPayment = {
  id: string;
  splitGroup: number;
  amountCents: number;
  tipCents: number;
  totalCents: number;
  status: string;
  cardBrand: string | null;
  cardLast4: string | null;
  receiptEmail: string | null;
  createdAt: string;
  succeededAt: string | null;
};

export type CheckDetail = {
  id: string;
  status: "open" | "paid" | "void";
  splitMode: SplitMode;
  splitCount: number;
  taxRateBps: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  createdAt: string;
  closedAt: string | null;
  session: { id: string; partySize: number; status: string; tableLabel: string };
  items: CheckItem[];
  payments: CheckPayment[];
};

export async function getCheckDetail(checkId: string): Promise<CheckDetail> {
  const supabase = await createClient();

  const { data: check, error } = await supabase
    .from("checks")
    .select(
      `id, status, split_mode, split_count, tax_rate_bps, subtotal_cents, tax_cents,
       total_cents, created_at, closed_at,
       table_sessions ( id, party_size, status, tables ( label ) ),
       check_items ( id, description, modifiers_summary, amount_cents, split_group, sort_order ),
       payments ( id, split_group, amount_cents, tip_cents, total_cents, status, card_brand,
                  card_last4, receipt_email, created_at, succeeded_at )`,
    )
    .eq("id", checkId)
    .order("sort_order", { referencedTable: "check_items", ascending: true })
    .order("created_at", { referencedTable: "payments", ascending: true })
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load check: ${error.message}`);
  }
  if (!check) {
    notFound();
  }

  const session = check.table_sessions as unknown as {
    id: string;
    party_size: number;
    status: string;
    tables: { label: string };
  };

  return {
    id: check.id,
    status: check.status,
    splitMode: check.split_mode as SplitMode,
    splitCount: check.split_count,
    taxRateBps: check.tax_rate_bps,
    subtotalCents: check.subtotal_cents,
    taxCents: check.tax_cents,
    totalCents: check.total_cents,
    createdAt: check.created_at,
    closedAt: check.closed_at,
    session: {
      id: session.id,
      partySize: session.party_size,
      status: session.status,
      tableLabel: session.tables.label,
    },
    items: check.check_items.map(
      (item: {
        id: string;
        description: string;
        modifiers_summary: string | null;
        amount_cents: number;
        split_group: number | null;
      }) => ({
        id: item.id,
        description: item.description,
        modifiersSummary: item.modifiers_summary,
        amountCents: item.amount_cents,
        splitGroup: item.split_group,
      }),
    ),
    payments: check.payments.map(
      (payment: {
        id: string;
        split_group: number;
        amount_cents: number;
        tip_cents: number;
        total_cents: number;
        status: string;
        card_brand: string | null;
        card_last4: string | null;
        receipt_email: string | null;
        created_at: string;
        succeeded_at: string | null;
      }) => ({
        id: payment.id,
        splitGroup: payment.split_group,
        amountCents: payment.amount_cents,
        tipCents: payment.tip_cents,
        totalCents: payment.total_cents,
        status: payment.status,
        cardBrand: payment.card_brand,
        cardLast4: payment.card_last4,
        receiptEmail: payment.receipt_email,
        createdAt: payment.created_at,
        succeededAt: payment.succeeded_at,
      }),
    ),
  };
}

// -- Transaction history / reporting ---------------------------------------

export type Transaction = {
  id: string;
  checkId: string;
  tableLabel: string;
  splitGroup: number;
  splitMode: SplitMode;
  amountCents: number;
  tipCents: number;
  totalCents: number;
  applicationFeeCents: number;
  status: string;
  cardBrand: string | null;
  cardLast4: string | null;
  createdAt: string;
  succeededAt: string | null;
};

export type TransactionSummary = {
  count: number;
  grossCents: number; // everything collected, tips included
  tipsCents: number;
  taxCents: number;
  feesCents: number;
  netCents: number; // gross minus platform fees (Stripe's own processing fee is not visible here)
  refundedCents: number;
};

// [from, to) on payments.created_at. Capped so a very wide range can't
// pull an unbounded result set into one render.
export async function getTransactions(
  restaurantId: string,
  fromIso: string,
  toIso: string,
): Promise<{ transactions: Transaction[]; summary: TransactionSummary; truncated: boolean }> {
  const supabase = await createClient();
  const LIMIT = 1000;

  const { data: payments, error } = await supabase
    .from("payments")
    .select(
      `id, check_id, split_group, amount_cents, tip_cents, total_cents, application_fee_cents,
       status, card_brand, card_last4, created_at, succeeded_at,
       checks ( split_mode, split_count, tax_cents, total_cents, table_sessions ( tables ( label ) ) )`,
    )
    .eq("restaurant_id", restaurantId)
    .gte("created_at", fromIso)
    .lt("created_at", toIso)
    .in("status", ["succeeded", "refunded", "failed"])
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  if (error) {
    throw new Error(`Failed to load transactions: ${error.message}`);
  }

  const summary: TransactionSummary = {
    count: 0,
    grossCents: 0,
    tipsCents: 0,
    taxCents: 0,
    feesCents: 0,
    netCents: 0,
    refundedCents: 0,
  };

  const transactions = payments.map((payment) => {
    const check = payment.checks as unknown as {
      split_mode: SplitMode;
      tax_cents: number;
      total_cents: number;
      table_sessions: { tables: { label: string } };
    };

    if (payment.status === "succeeded") {
      summary.count += 1;
      summary.grossCents += payment.total_cents;
      summary.tipsCents += payment.tip_cents;
      summary.feesCents += payment.application_fee_cents;
      // Tax collected attributed pro rata to this payment's share of the check.
      summary.taxCents +=
        check.total_cents > 0
          ? Math.round((check.tax_cents * payment.amount_cents) / check.total_cents)
          : 0;
    } else if (payment.status === "refunded") {
      summary.refundedCents += payment.total_cents;
    }

    return {
      id: payment.id,
      checkId: payment.check_id,
      tableLabel: check.table_sessions.tables.label,
      splitGroup: payment.split_group,
      splitMode: check.split_mode,
      amountCents: payment.amount_cents,
      tipCents: payment.tip_cents,
      totalCents: payment.total_cents,
      applicationFeeCents: payment.application_fee_cents,
      status: payment.status,
      cardBrand: payment.card_brand,
      cardLast4: payment.card_last4,
      createdAt: payment.created_at,
      succeededAt: payment.succeeded_at,
    };
  });

  summary.netCents = summary.grossCents - summary.feesCents;

  return { transactions, summary, truncated: payments.length === LIMIT };
}
