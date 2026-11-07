"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

import { createPayment, syncPayment } from "@/lib/actions/billing";
import { TIP_PRESET_PERCENTS, formatMoney, tipForPercent, type Portion } from "@/lib/billing/split";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

// Destination charges are created on the platform account, so Stripe.js
// uses the platform's publishable key (no stripeAccount option).
let stripePromise: Promise<StripeJs | null> | null = null;
function getStripeJs() {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) return null;
  stripePromise ??= loadStripe(key);
  return stripePromise;
}

type TipChoice = { kind: "none" } | { kind: "percent"; percent: number } | { kind: "custom" };

function CardStep({
  restaurantSlug,
  paymentId,
  totalCents,
  onDone,
}: {
  restaurantSlug: string;
  paymentId: string;
  totalCents: number;
  onDone: (message: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePay() {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (confirmError) {
      setError(confirmError.message ?? "The card was declined.");
      setSubmitting(false);
      return;
    }

    // Ask the server to re-read the PaymentIntent from Stripe (rather than
    // waiting on webhook delivery) so the check updates right away.
    const result = await syncPayment(restaurantSlug, paymentId);
    setSubmitting(false);
    if (result?.error) {
      onDone("Payment submitted — waiting for Stripe to confirm.");
    } else if (result?.status === "succeeded") {
      onDone("Payment approved.");
    } else {
      onDone("Payment is processing — this check will update when Stripe confirms.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {error ? <p className="font-body-sm text-body-sm text-error">{error}</p> : null}
      <Button size="lg" variant="primary" disabled={!stripe || submitting} onClick={handlePay}>
        {submitting ? "Processing..." : `Charge ${formatMoney(totalCents)}`}
      </Button>
    </div>
  );
}

export function PaymentSheet({
  restaurantSlug,
  checkId,
  portion,
  portionName,
  onClose,
}: {
  restaurantSlug: string;
  checkId: string;
  portion: Portion;
  portionName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [tipChoice, setTipChoice] = useState<TipChoice>({ kind: "percent", percent: 18 });
  const [customTip, setCustomTip] = useState("");
  const [receiptEmail, setReceiptEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intent, setIntent] = useState<{ clientSecret: string; paymentId: string; totalCents: number } | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  const stripeJs = getStripeJs();

  const tipCents =
    tipChoice.kind === "none"
      ? 0
      : tipChoice.kind === "percent"
        ? tipForPercent(portion.subtotalCents, tipChoice.percent)
        : Math.max(0, Math.round((Number.parseFloat(customTip) || 0) * 100));

  async function handleContinue() {
    setCreating(true);
    setError(null);
    const result = await createPayment(restaurantSlug, {
      checkId,
      splitGroup: portion.group,
      tipCents,
      receiptEmail: receiptEmail.trim() || undefined,
    });
    setCreating(false);
    if (result.error !== undefined) {
      setError(result.error);
      return;
    }
    setIntent({
      clientSecret: result.clientSecret,
      paymentId: result.paymentId,
      totalCents: result.totalCents,
    });
  }

  function close() {
    if (doneMessage) router.refresh();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-on-surface/40"
      role="dialog"
      aria-modal="true"
      aria-label={`Take payment for ${portionName}`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !creating) close();
      }}
    >
      <div className="bg-surface w-full sm:max-w-md max-h-[92dvh] rounded-t-xl sm:rounded-lg flex flex-col shadow-lg">
        <div className="flex items-center justify-between px-4 h-14 border-b border-outline-variant shrink-0">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">{portionName}</h2>
          <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Close" onClick={close}>
            <Icon name="close" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {doneMessage ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Icon name="check_circle" filled className="text-5xl text-primary" />
              <p className="font-body-lg text-body-lg text-on-surface">{doneMessage}</p>
              <Button variant="primary" onClick={close}>
                Done
              </Button>
            </div>
          ) : (
            <>
              <dl className="flex flex-col gap-1 font-body-sm text-body-sm text-on-surface-variant">
                <div className="flex justify-between">
                  <dt>Subtotal</dt>
                  <dd>{formatMoney(portion.subtotalCents)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Tax</dt>
                  <dd>{formatMoney(portion.taxCents)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Tip</dt>
                  <dd>{formatMoney(tipCents)}</dd>
                </div>
                <div className="flex justify-between font-headline-sm text-headline-sm text-on-surface pt-1">
                  <dt>Total</dt>
                  <dd>{formatMoney(portion.totalCents + tipCents)}</dd>
                </div>
              </dl>

              {!intent ? (
                <>
                  <fieldset className="flex flex-col gap-2">
                    <legend className="font-label-caps text-label-caps text-on-surface-variant mb-2">
                      Tip
                    </legend>
                    <div className="grid grid-cols-3 gap-2">
                      {TIP_PRESET_PERCENTS.map((percent) => (
                        <button
                          key={percent}
                          type="button"
                          aria-pressed={tipChoice.kind === "percent" && tipChoice.percent === percent}
                          onClick={() => setTipChoice({ kind: "percent", percent })}
                          className={cn(
                            "min-h-14 rounded border flex flex-col items-center justify-center",
                            tipChoice.kind === "percent" && tipChoice.percent === percent
                              ? "border-primary bg-primary-fixed text-on-primary-fixed"
                              : "border-outline-variant bg-surface-container-lowest text-on-surface",
                          )}
                        >
                          <span className="font-label-lg text-label-lg">{percent}%</span>
                          <span className="font-body-sm text-body-sm text-on-surface-variant">
                            {formatMoney(tipForPercent(portion.subtotalCents, percent))}
                          </span>
                        </button>
                      ))}
                      <button
                        type="button"
                        aria-pressed={tipChoice.kind === "custom"}
                        onClick={() => setTipChoice({ kind: "custom" })}
                        className={cn(
                          "min-h-14 rounded border font-label-lg text-label-lg",
                          tipChoice.kind === "custom"
                            ? "border-primary bg-primary-fixed text-on-primary-fixed"
                            : "border-outline-variant bg-surface-container-lowest text-on-surface",
                        )}
                      >
                        Custom
                      </button>
                      <button
                        type="button"
                        aria-pressed={tipChoice.kind === "none"}
                        onClick={() => setTipChoice({ kind: "none" })}
                        className={cn(
                          "min-h-14 rounded border font-label-lg text-label-lg",
                          tipChoice.kind === "none"
                            ? "border-primary bg-primary-fixed text-on-primary-fixed"
                            : "border-outline-variant bg-surface-container-lowest text-on-surface",
                        )}
                      >
                        No tip
                      </button>
                    </div>
                    {tipChoice.kind === "custom" ? (
                      <Input
                        icon="attach_money"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        placeholder="0.00"
                        aria-label="Custom tip amount"
                        value={customTip}
                        onChange={(e) => setCustomTip(e.target.value)}
                        autoFocus
                      />
                    ) : null}
                  </fieldset>

                  <label className="flex flex-col gap-1">
                    <span className="font-label-caps text-label-caps text-on-surface-variant">
                      Email receipt (optional)
                    </span>
                    <Input
                      icon="mail"
                      type="email"
                      placeholder="guest@example.com"
                      value={receiptEmail}
                      onChange={(e) => setReceiptEmail(e.target.value)}
                    />
                  </label>

                  {!stripeJs ? (
                    <p className="font-body-sm text-body-sm text-error">
                      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY isn&apos;t set, so the card form can&apos;t load.
                    </p>
                  ) : null}
                  {error ? <p className="font-body-sm text-body-sm text-error">{error}</p> : null}

                  <Button
                    size="lg"
                    variant="primary"
                    disabled={creating || !stripeJs}
                    onClick={handleContinue}
                  >
                    {creating ? "Preparing..." : "Continue to card"}
                  </Button>
                </>
              ) : stripeJs ? (
                <Elements
                  stripe={stripeJs}
                  options={{
                    clientSecret: intent.clientSecret,
                    appearance: {
                      theme: "stripe",
                      variables: { colorPrimary: "#173124", fontFamily: "Geist, system-ui, sans-serif" },
                    },
                  }}
                >
                  <CardStep
                    restaurantSlug={restaurantSlug}
                    paymentId={intent.paymentId}
                    totalCents={intent.totalCents}
                    onDone={setDoneMessage}
                  />
                </Elements>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
