"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import type { CheckDetail } from "@/lib/data/billing";
import {
  MAX_SPLIT_COUNT,
  computeCheckBreakdown,
  formatMoney,
  portionLabel,
  type Portion,
  type SplitMode,
} from "@/lib/billing/split";
import {
  assignCheckItem,
  closeZeroCheck,
  regenerateCheck,
  updateCheckSplit,
} from "@/lib/actions/billing";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";
import { PaymentSheet } from "@/components/billing/payment-sheet";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

const MODE_OPTIONS: { mode: SplitMode; label: string; icon: string }[] = [
  { mode: "none", label: "One check", icon: "receipt" },
  { mode: "even", label: "Split evenly", icon: "call_split" },
  { mode: "by_seat", label: "By seat", icon: "event_seat" },
  { mode: "by_item", label: "By item", icon: "checklist" },
];

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  succeeded: "Paid",
  failed: "Failed",
  canceled: "Canceled",
  refunded: "Refunded",
};

export function CheckWorkspace({
  restaurantId,
  restaurantSlug,
  check,
  canBill,
  paymentsReady,
}: {
  restaurantId: string;
  restaurantSlug: string;
  check: CheckDetail;
  canBill: boolean;
  paymentsReady: boolean;
}) {
  useRealtimeRefresh(`check-${check.id}`, restaurantId, ["checks", "payments", "check_items"]);

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [payingPortion, setPayingPortion] = useState<Portion | null>(null);

  const breakdown = computeCheckBreakdown({
    lines: check.items.map((item) => ({
      id: item.id,
      amountCents: item.amountCents,
      splitGroup: item.splitGroup,
    })),
    taxRateBps: check.taxRateBps,
    splitMode: check.splitMode,
    splitCount: check.splitCount,
  });

  const succeeded = check.payments.filter((p) => p.status === "succeeded");
  const paidByGroup = new Map(succeeded.map((p) => [p.splitGroup, p]));
  const isOpen = check.status === "open";
  const splitLocked = !isOpen || succeeded.length > 0 || !canBill;
  const assigning = check.splitMode === "by_seat" || check.splitMode === "by_item";
  const collectedCents = succeeded.reduce((sum, p) => sum + p.amountCents, 0);
  const tipsCents = succeeded.reduce((sum, p) => sum + p.tipCents, 0);

  function run(action: () => Promise<{ error?: string } | undefined | void>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result && "error" in result && result.error) setError(result.error);
    });
  }

  function changeMode(mode: SplitMode) {
    if (mode === check.splitMode) return;
    const defaultCount =
      mode === "none" ? 1 : mode === "even" ? 2 : Math.max(2, check.session.partySize);
    run(() => updateCheckSplit(restaurantSlug, check.id, mode, defaultCount));
  }

  function changeCount(delta: number) {
    const next = Math.min(MAX_SPLIT_COUNT, Math.max(2, check.splitCount + delta));
    if (next === check.splitCount) return;
    run(() => updateCheckSplit(restaurantSlug, check.id, check.splitMode, next));
  }

  return (
    <div className="flex-1 flex flex-col lg:flex-row min-h-0">
      {/* Items + split config */}
      <section className="flex-1 min-w-0 overflow-y-auto p-4 md:p-6 flex flex-col gap-5">
        {check.status !== "open" ? (
          <div
            className={cn(
              "flex items-center gap-3 p-4 rounded border",
              check.status === "paid"
                ? "border-primary-fixed-dim bg-primary-fixed/50"
                : "border-outline-variant bg-surface-container",
            )}
          >
            <Icon
              name={check.status === "paid" ? "verified" : "block"}
              className="text-xl text-primary"
            />
            <p className="font-body-md text-body-md text-on-surface">
              {check.status === "paid"
                ? `Paid in full${check.closedAt ? ` at ${new Date(check.closedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}. The table is marked for bussing.`
                : "This check was voided (it was rebuilt or replaced)."}
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          <h2 className="font-label-caps text-label-caps text-on-surface-variant uppercase">Split</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Split mode">
            {MODE_OPTIONS.map((option) => (
              <button
                key={option.mode}
                type="button"
                role="radio"
                aria-checked={check.splitMode === option.mode}
                disabled={splitLocked || pending}
                onClick={() => changeMode(option.mode)}
                className={cn(
                  "min-h-14 rounded border flex items-center justify-center gap-2 px-3 font-label-lg text-label-lg disabled:opacity-60",
                  check.splitMode === option.mode
                    ? "border-primary bg-primary text-on-primary"
                    : "border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-high",
                )}
              >
                <Icon name={option.icon} className="text-lg" />
                {option.label}
              </button>
            ))}
          </div>

          {check.splitMode !== "none" ? (
            <div className="flex items-center gap-3">
              <span className="font-body-md text-body-md text-on-surface">
                {check.splitMode === "by_seat" ? "Seats" : check.splitMode === "by_item" ? "Guests" : "Ways"}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11"
                aria-label="Fewer"
                disabled={splitLocked || pending || check.splitCount <= 2}
                onClick={() => changeCount(-1)}
              >
                <Icon name="remove" />
              </Button>
              <span className="font-headline-sm text-headline-sm w-8 text-center">{check.splitCount}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11"
                aria-label="More"
                disabled={splitLocked || pending || check.splitCount >= MAX_SPLIT_COUNT}
                onClick={() => changeCount(1)}
              >
                <Icon name="add" />
              </Button>
            </div>
          ) : null}

          {succeeded.length > 0 && isOpen ? (
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              The split is locked because a payment has already been taken.
            </p>
          ) : null}
          {error ? <p className="font-body-sm text-body-sm text-error">{error}</p> : null}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="font-label-caps text-label-caps text-on-surface-variant uppercase">
              Items ({check.items.length})
            </h2>
            {assigning && breakdown.unassignedItemIds.length > 0 ? (
              <span className="font-label-caps text-label-caps text-error">
                {breakdown.unassignedItemIds.length} unassigned
              </span>
            ) : null}
          </div>
          <ul className="divide-y divide-outline-variant border border-outline-variant rounded bg-surface-container-lowest">
            {check.items.map((item) => (
              <li key={item.id} className="px-4 py-3 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-body-md text-body-md text-on-surface">{item.description}</p>
                    {item.modifiersSummary ? (
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        {item.modifiersSummary}
                      </p>
                    ) : null}
                  </div>
                  <span className="font-label-lg text-label-lg text-on-surface shrink-0">
                    {formatMoney(item.amountCents)}
                  </span>
                </div>
                {assigning ? (
                  <div className="flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label={`Assign ${item.description}`}>
                    {Array.from({ length: check.splitCount }, (_, i) => i + 1).map((group) => {
                      const selected = item.splitGroup === group;
                      return (
                        <button
                          key={group}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          disabled={splitLocked || pending}
                          onClick={() =>
                            run(() =>
                              assignCheckItem(restaurantSlug, check.id, item.id, selected ? null : group),
                            )
                          }
                          className={cn(
                            "min-h-11 min-w-11 px-3 rounded-full border font-label-lg text-label-lg shrink-0 disabled:opacity-60",
                            selected
                              ? "border-primary bg-primary text-on-primary"
                              : "border-outline-variant text-on-surface hover:bg-surface-container-high",
                          )}
                        >
                          {check.splitMode === "by_seat" ? `S${group}` : `G${group}`}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>

        {isOpen && canBill ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={pending || succeeded.length > 0}
              title="Rebuild from the table's current order (e.g. after more was ordered)"
              onClick={() => {
                if (!window.confirm("Rebuild this check from the table's current order? Any split is reset.")) return;
                run(() => regenerateCheck(restaurantSlug, check.id));
              }}
            >
              <Icon name="refresh" className="text-lg" />
              Rebuild from order
            </Button>
            <Button variant="ghost" asChild>
              <Link href={`/${restaurantSlug}/orders/${check.session.id}`}>
                <Icon name="receipt_long" className="text-lg" />
                Back to order
              </Link>
            </Button>
          </div>
        ) : null}
      </section>

      {/* Totals + portions + payments */}
      <aside className="w-full lg:w-[26rem] shrink-0 border-t lg:border-t-0 lg:border-l border-outline-variant bg-surface flex flex-col lg:overflow-y-auto">
        <div className="p-4 md:p-6 flex flex-col gap-1 border-b border-outline-variant">
          <div className="flex justify-between font-body-sm text-body-sm text-on-surface-variant">
            <span>Subtotal</span>
            <span>{formatMoney(breakdown.subtotalCents)}</span>
          </div>
          <div className="flex justify-between font-body-sm text-body-sm text-on-surface-variant">
            <span>Tax ({(check.taxRateBps / 100).toFixed(2).replace(/\.?0+$/, "")}%)</span>
            <span>{formatMoney(breakdown.taxCents)}</span>
          </div>
          <div className="flex justify-between font-headline-sm text-headline-sm text-on-surface">
            <span>Total</span>
            <span>{formatMoney(breakdown.totalCents)}</span>
          </div>
          {succeeded.length > 0 ? (
            <div className="flex justify-between font-body-sm text-body-sm text-on-surface-variant pt-1">
              <span>Collected (+ {formatMoney(tipsCents)} tips)</span>
              <span>{formatMoney(collectedCents)}</span>
            </div>
          ) : null}
        </div>

        <div className="p-4 md:p-6 flex flex-col gap-3">
          <h2 className="font-label-caps text-label-caps text-on-surface-variant uppercase">
            {check.splitMode === "none" ? "Payment" : "Portions"}
          </h2>

          {isOpen && breakdown.totalCents === 0 && canBill ? (
            <Button variant="primary" disabled={pending} onClick={() => run(() => closeZeroCheck(restaurantSlug, check.id))}>
              Close $0 check
            </Button>
          ) : null}

          {breakdown.portions.map((portion) => {
            const paid = paidByGroup.get(portion.group);
            const name = portionLabel(check.splitMode, portion.group);
            const blockedByAssignment = assigning && breakdown.unassignedItemIds.length > 0;
            return (
              <div
                key={portion.group}
                className="flex items-center justify-between gap-3 p-3 rounded border border-outline-variant bg-surface-container-lowest"
              >
                <div className="min-w-0">
                  <p className="font-label-lg text-label-lg text-on-surface">{name}</p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {formatMoney(portion.subtotalCents)} + {formatMoney(portion.taxCents)} tax
                    {assigning ? ` · ${portion.itemIds.length} item${portion.itemIds.length === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-headline-sm text-headline-sm text-on-surface">
                    {formatMoney(portion.totalCents)}
                  </span>
                  {paid ? (
                    <span className="flex items-center gap-1 font-label-caps text-label-caps text-primary">
                      <Icon name="check_circle" filled className="text-lg" />
                      Paid
                    </span>
                  ) : portion.totalCents === 0 ? (
                    <span className="font-label-caps text-label-caps text-on-surface-variant">—</span>
                  ) : isOpen && canBill ? (
                    <Button
                      variant="primary"
                      disabled={!paymentsReady || blockedByAssignment || pending}
                      title={
                        !paymentsReady
                          ? "Finish Stripe onboarding in Settings to take card payments"
                          : blockedByAssignment
                            ? "Assign every item first"
                            : undefined
                      }
                      onClick={() => setPayingPortion(portion)}
                    >
                      Pay
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}

          {!paymentsReady && isOpen ? (
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Card payments are disabled until Stripe onboarding is finished in{" "}
              <Link href={`/${restaurantSlug}/admin/settings`} className="underline text-primary">
                Settings
              </Link>
              .
            </p>
          ) : null}
        </div>

        {check.payments.length > 0 ? (
          <div className="p-4 md:p-6 pt-0 flex flex-col gap-2">
            <h2 className="font-label-caps text-label-caps text-on-surface-variant uppercase">
              Payment history
            </h2>
            <ul className="divide-y divide-outline-variant border border-outline-variant rounded bg-surface-container-lowest">
              {check.payments.map((payment) => (
                <li key={payment.id} className="px-3 py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-body-sm text-body-sm text-on-surface">
                      {portionLabel(check.splitMode, payment.splitGroup)} ·{" "}
                      {formatMoney(payment.totalCents)}
                      {payment.tipCents > 0 ? ` (incl. ${formatMoney(payment.tipCents)} tip)` : ""}
                    </p>
                    <p className="font-label-caps text-label-caps text-on-surface-variant">
                      {PAYMENT_STATUS_LABEL[payment.status] ?? payment.status}
                      {payment.cardLast4 ? ` · ${payment.cardBrand ?? "card"} •••• ${payment.cardLast4}` : ""}
                    </p>
                  </div>
                  {payment.status === "succeeded" || payment.status === "refunded" ? (
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/${restaurantSlug}/billing/${check.id}/receipt?payment=${payment.id}`}>
                        <Icon name="print" className="text-base" />
                        Receipt
                      </Link>
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="p-4 md:p-6 pt-0">
          <Button variant="outline" className="w-full" asChild>
            <Link href={`/${restaurantSlug}/billing/${check.id}/receipt`}>
              <Icon name="print" className="text-lg" />
              {check.status === "paid" ? "Print receipt" : "Print check"}
            </Link>
          </Button>
        </div>
      </aside>

      {payingPortion ? (
        <PaymentSheet
          restaurantSlug={restaurantSlug}
          checkId={check.id}
          portion={payingPortion}
          portionName={`Table ${check.session.tableLabel} · ${portionLabel(check.splitMode, payingPortion.group)}`}
          onClose={() => setPayingPortion(null)}
        />
      ) : null}
    </div>
  );
}
