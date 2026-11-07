import Link from "next/link";

import { getRestaurantForSlug } from "@/lib/data/restaurant";
import { getCheckDetail } from "@/lib/data/billing";
import { computeCheckBreakdown, formatMoney, portionLabel } from "@/lib/billing/split";
import { PrintButton } from "@/components/billing/print-button";
import { Icon } from "@/components/icon";

// Printable receipt. Without ?payment= it's the whole check (a "pre-bill"
// while open, or the paid receipt with every payment listed); with
// ?payment=<id> it's one guest's receipt for their portion. Emailed
// receipts are sent by Stripe itself (receipt_email on the PaymentIntent).
export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantSlug: string; checkId: string }>;
  searchParams: Promise<{ payment?: string }>;
}) {
  const { restaurantSlug, checkId } = await params;
  const { payment: paymentId } = await searchParams;
  const { restaurant } = await getRestaurantForSlug(restaurantSlug);
  const check = await getCheckDetail(checkId);

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

  const payment = paymentId ? check.payments.find((p) => p.id === paymentId) : undefined;
  const portion = payment ? breakdown.portions.find((p) => p.group === payment.splitGroup) : undefined;
  const assigned = check.splitMode === "by_seat" || check.splitMode === "by_item";

  // A portion receipt for a by-seat/by-item split lists only that guest's
  // items; an even split or whole-check receipt lists everything.
  const items =
    portion && assigned ? check.items.filter((item) => portion.itemIds.includes(item.id)) : check.items;
  const subtotal = portion ? portion.subtotalCents : breakdown.subtotalCents;
  const tax = portion ? portion.taxCents : breakdown.taxCents;
  const amount = portion ? portion.totalCents : breakdown.totalCents;
  const payments = payment
    ? [payment]
    : check.payments.filter((p) => p.status === "succeeded" || p.status === "refunded");
  const tips = payments.reduce((sum, p) => sum + p.tipCents, 0);
  const printedAt = new Date(payment?.succeededAt ?? check.closedAt ?? check.createdAt);

  return (
    <div className="min-h-dvh bg-surface-container p-4 md:p-8 flex flex-col items-center gap-4">
      {/* Print just the receipt: hide the app chrome (sidebar/top bar). */}
      <style>{`
        @media print {
          @page { margin: 12mm; }
          body * { visibility: hidden !important; }
          #receipt, #receipt * { visibility: visible !important; }
          #receipt { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; border: 0 !important; }
        }
      `}</style>

      <div className="flex gap-2 w-full max-w-sm justify-between print:hidden">
        <Link
          href={`/${restaurantSlug}/billing/${check.id}`}
          className="inline-flex items-center gap-1 h-11 px-3 rounded hover:bg-surface-container-high text-on-surface-variant font-label-lg text-label-lg"
        >
          <Icon name="arrow_back" />
          Back to check
        </Link>
        <PrintButton />
      </div>

      <article
        id="receipt"
        className="w-full max-w-sm bg-surface-container-lowest border border-outline-variant shadow-sm p-6 font-mono-sm text-sm text-on-surface flex flex-col gap-4"
      >
        <header className="text-center flex flex-col gap-1">
          <h1 className="font-headline-sm text-headline-sm">{restaurant.name}</h1>
          <p className="text-on-surface-variant">
            Table {check.session.tableLabel} · Party of {check.session.partySize}
          </p>
          <p className="text-on-surface-variant">
            {printedAt.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
          </p>
          {portion ? <p className="font-bold">{portionLabel(check.splitMode, portion.group)}</p> : null}
          {check.status === "open" && !payment ? (
            <p className="font-bold uppercase tracking-wide">Check — not yet paid</p>
          ) : null}
        </header>

        <hr className="border-dashed border-outline-variant" />

        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.id} className="flex justify-between gap-3">
              <span className="min-w-0">
                {item.description}
                {item.modifiersSummary ? (
                  <span className="block text-on-surface-variant pl-3">{item.modifiersSummary}</span>
                ) : null}
              </span>
              <span className="shrink-0">{formatMoney(item.amountCents)}</span>
            </li>
          ))}
        </ul>

        {portion && check.splitMode === "even" ? (
          <p className="text-on-surface-variant">
            Split evenly {check.splitCount} ways (check total {formatMoney(breakdown.totalCents)})
          </p>
        ) : null}

        <hr className="border-dashed border-outline-variant" />

        <dl className="flex flex-col gap-1">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd>{formatMoney(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Tax ({(check.taxRateBps / 100).toFixed(2)}%)</dt>
            <dd>{formatMoney(tax)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Total</dt>
            <dd>{formatMoney(amount)}</dd>
          </div>
          {payments.length > 0 ? (
            <>
              <div className="flex justify-between">
                <dt>Tip</dt>
                <dd>{formatMoney(tips)}</dd>
              </div>
              <div className="flex justify-between font-bold text-base">
                <dt>Paid</dt>
                <dd>{formatMoney(payments.reduce((sum, p) => sum + p.totalCents, 0))}</dd>
              </div>
            </>
          ) : (
            <>
              {/* Pre-bill: suggested tips for the guest. */}
              <div className="pt-2 text-on-surface-variant">
                {[15, 18, 20].map((percent) => (
                  <div key={percent} className="flex justify-between">
                    <span>{percent}% tip</span>
                    <span>{formatMoney(Math.round((subtotal * percent) / 100))}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </dl>

        {payments.length > 0 ? (
          <>
            <hr className="border-dashed border-outline-variant" />
            <ul className="flex flex-col gap-1">
              {payments.map((p) => (
                <li key={p.id} className="flex justify-between gap-3">
                  <span>
                    {p.cardBrand ? p.cardBrand.toUpperCase() : "Card"}
                    {p.cardLast4 ? ` •••• ${p.cardLast4}` : ""}
                    {payments.length > 1 ? ` · ${portionLabel(check.splitMode, p.splitGroup)}` : ""}
                    {p.status === "refunded" ? " (refunded)" : ""}
                  </span>
                  <span>{formatMoney(p.totalCents)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <footer className="text-center text-on-surface-variant pt-2">
          Thank you!
          <span className="block text-xs mt-1">Ref {check.id.slice(0, 8).toUpperCase()}</span>
        </footer>
      </article>
    </div>
  );
}
