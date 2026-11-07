"use client";

import { useActionState, useEffect, useRef, useTransition, useState } from "react";

import {
  openStripeDashboard,
  refreshStripeAccountStatus,
  startStripeOnboarding,
  updateTaxRate,
} from "@/lib/actions/billing";
import type { StripeAccountState } from "@/lib/data/billing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/icon";

export function TaxRateForm({
  restaurantSlug,
  taxRateBps,
  canEdit,
}: {
  restaurantSlug: string;
  taxRateBps: number;
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    updateTaxRate.bind(null, restaurantSlug),
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <label htmlFor="taxRatePercent" className="font-label-caps text-label-caps text-on-surface-variant">
        Sales tax rate (%)
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id="taxRatePercent"
          name="taxRatePercent"
          type="number"
          inputMode="decimal"
          step="0.01"
          min={0}
          max={50}
          defaultValue={(taxRateBps / 100).toFixed(2)}
          disabled={!canEdit}
          className="w-32"
        />
        {canEdit ? (
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Saving..." : "Save"}
          </Button>
        ) : null}
      </div>
      {state?.fieldErrors?.taxRatePercent ? (
        <p className="font-label-caps text-label-caps text-error">{state.fieldErrors.taxRatePercent[0]}</p>
      ) : null}
      {state?.error ? <p className="font-label-caps text-label-caps text-error">{state.error}</p> : null}
      {state?.success ? <p className="font-body-sm text-body-sm text-primary">{state.success}</p> : null}
    </form>
  );
}

function StatusRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 font-body-md text-body-md text-on-surface">
      <Icon
        name={ok ? "check_circle" : "pending"}
        filled={ok}
        className={ok ? "text-primary text-xl" : "text-on-surface-variant text-xl"}
      />
      {label}
    </li>
  );
}

export function StripeConnectPanel({
  restaurantSlug,
  account,
  canManage,
  stripeConfigured,
  justReturned,
}: {
  restaurantSlug: string;
  account: StripeAccountState | null;
  canManage: boolean;
  stripeConfigured: boolean;
  justReturned: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error?: string; success?: string } | null>(null);
  const synced = useRef(false);

  function run(action: () => Promise<{ error?: string; success?: string } | undefined>) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (result) setMessage(result);
    });
  }

  // Landing back from Stripe's hosted onboarding: pull the latest account
  // state right away instead of waiting for the account.updated webhook.
  useEffect(() => {
    if (justReturned && account && !synced.current) {
      synced.current = true;
      run(() => refreshStripeAccountStatus(restaurantSlug));
    }
  }, [justReturned, account, restaurantSlug]);

  if (!stripeConfigured) {
    return (
      <p className="font-body-md text-body-md text-on-surface-variant">
        Stripe isn&apos;t configured for this deployment yet (STRIPE_SECRET_KEY). See web/README.md.
      </p>
    );
  }

  const ready = account?.chargesEnabled ?? false;

  return (
    <div className="flex flex-col gap-4">
      {account ? (
        <ul className="flex flex-col gap-2">
          <StatusRow ok={account.detailsSubmitted} label="Business details submitted" />
          <StatusRow ok={account.chargesEnabled} label="Card payments enabled" />
          <StatusRow ok={account.payoutsEnabled} label="Payouts enabled" />
        </ul>
      ) : (
        <p className="font-body-md text-body-md text-on-surface-variant">
          Connect a Stripe account to take card payments. Stripe handles identity verification
          and bank details; payouts go straight to the restaurant.
        </p>
      )}

      {canManage ? (
        <div className="flex flex-wrap gap-2">
          {!ready ? (
            <Button
              variant="primary"
              disabled={pending}
              onClick={() => run(() => startStripeOnboarding(restaurantSlug))}
            >
              <Icon name="account_balance" className="text-lg" />
              {account ? "Continue Stripe onboarding" : "Set up payments with Stripe"}
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => run(() => openStripeDashboard(restaurantSlug))}
            >
              <Icon name="open_in_new" className="text-lg" />
              Stripe dashboard
            </Button>
          )}
          {account ? (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => run(() => refreshStripeAccountStatus(restaurantSlug))}
            >
              <Icon name="refresh" className="text-lg" />
              Refresh status
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Only owners and admins can manage payouts.
        </p>
      )}

      {message?.error ? <p className="font-body-sm text-body-sm text-error">{message.error}</p> : null}
      {message?.success ? <p className="font-body-sm text-body-sm text-primary">{message.success}</p> : null}
    </div>
  );
}
