import "server-only";

import { createClient } from "@supabase/supabase-js";

// Service-role client: bypasses RLS. Only used for the money-moving writes
// that 0005_billing.sql deliberately gives the authenticated role no
// policy for (payments, checks -> 'paid', restaurant_stripe_accounts,
// stripe_webhook_events) — and only *after* the caller has been
// authorized (via the user's own RLS-scoped client) or the request has been
// verified as coming from Stripe (webhook signature). Never import this
// from a Client Component.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — required for billing (see web/README.md).",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
