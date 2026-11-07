import type Stripe from "stripe";
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import {
  applyPaymentIntent,
  markPaymentRefunded,
  syncStripeAccount,
} from "@/lib/billing/finalize";

// Stripe webhook endpoint. Configure in the Stripe dashboard (or
// `stripe listen --forward-to localhost:3000/api/stripe/webhook`) with:
//   payment_intent.succeeded, payment_intent.payment_failed,
//   payment_intent.canceled, charge.refunded
// and, as a *Connect* (connected accounts) endpoint, account.updated.
// STRIPE_WEBHOOK_SECRET may hold several comma-separated secrets so one
// route can serve both the platform and the Connect endpoint.
//
// Idempotency (0005_billing.sql → stripe_webhook_events): the event id is
// recorded before processing and processed_at set after, so a redelivery
// of a finished event is skipped, while one that failed mid-way (500 →
// Stripe retries) is processed again. Every handler below is itself
// idempotent, so a concurrent duplicate delivery is harmless too.

export const runtime = "nodejs";

function constructEvent(payload: string, signature: string): Stripe.Event {
  const secrets = (process.env.STRIPE_WEBHOOK_SECRET ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (secrets.length === 0) throw new Error("STRIPE_WEBHOOK_SECRET is not set");

  let lastError: unknown;
  for (const secret of secrets) {
    try {
      return getStripe().webhooks.constructEvent(payload, signature, secret);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

function restaurantIdFor(event: Stripe.Event): string | null {
  const object = event.data.object as { metadata?: Record<string, string> };
  return object.metadata?.restaurant_id ?? null;
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    // Signature verification needs the exact raw body.
    event = constructEvent(await request.text(), signature);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e) {
    console.error("Stripe webhook: storage not configured", e);
    // 500 so Stripe retries once the deployment is fixed.
    return NextResponse.json({ error: "Storage unavailable" }, { status: 500 });
  }

  const { data: existing, error: lookupError } = await admin
    .from("stripe_webhook_events")
    .select("processed_at")
    .eq("id", event.id)
    .maybeSingle();
  if (lookupError) {
    return NextResponse.json({ error: "Storage unavailable" }, { status: 500 });
  }
  if (existing?.processed_at) {
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (!existing) {
    const { error: insertError } = await admin.from("stripe_webhook_events").insert({
      id: event.id,
      type: event.type,
      restaurant_id: restaurantIdFor(event),
    });
    // 23505: a concurrent delivery of the same event just logged it; carry
    // on — the handlers are idempotent.
    if (insertError && insertError.code !== "23505") {
      return NextResponse.json({ error: "Storage unavailable" }, { status: 500 });
    }
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded":
      case "payment_intent.canceled":
      case "payment_intent.processing":
        await applyPaymentIntent(event.data.object.id);
        break;
      case "payment_intent.payment_failed":
        await applyPaymentIntent(event.data.object.id, { failureEvent: true });
        break;
      case "charge.refunded": {
        const charge = event.data.object;
        // Only a full refund flips the payment; partial refunds stay
        // "succeeded" (visible in Stripe) for now.
        if (charge.refunded && typeof charge.payment_intent === "string") {
          await markPaymentRefunded(charge.payment_intent);
        }
        break;
      }
      case "account.updated": {
        const account = event.data.object;
        await syncStripeAccount(account.id, {
          chargesEnabled: account.charges_enabled ?? false,
          payoutsEnabled: account.payouts_enabled ?? false,
          detailsSubmitted: account.details_submitted ?? false,
        });
        break;
      }
      default:
        // Not something we act on; still recorded as processed below.
        break;
    }
  } catch (e) {
    console.error(`Stripe webhook ${event.id} (${event.type}) failed`, e);
    // Leave processed_at null so Stripe's retry reprocesses it.
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  await admin
    .from("stripe_webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", event.id);

  return NextResponse.json({ received: true });
}
