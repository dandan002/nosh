import "server-only";

import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set — required for billing (see web/README.md).");
  }
  stripeClient ??= new Stripe(key, { appInfo: { name: "rev" } });
  return stripeClient;
}

// Platform cut on each payment, in basis points of the pre-tip amount
// (100 = 1%). Configured per deployment rather than per restaurant so a
// restaurant owner can't edit their own fee.
export function platformFeeBps(): number {
  const raw = Number(process.env.PLATFORM_FEE_BPS ?? "100");
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 100;
}

export const BILLING_CURRENCY = "usd";
