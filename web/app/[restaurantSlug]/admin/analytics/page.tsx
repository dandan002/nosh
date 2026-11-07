import Link from "next/link";

import { getRestaurantForSlug, isManagerOrAbove } from "@/lib/data/restaurant";
import { getTransactions } from "@/lib/data/billing";
import { formatMoney, portionLabel } from "@/lib/billing/split";
import { resolveDateRange } from "@/lib/billing/date-range";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<string, string> = {
  succeeded: "text-primary",
  refunded: "text-secondary",
  failed: "text-error",
};

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { restaurantSlug } = await params;
  const query = await searchParams;
  const { restaurant, staffMember } = await getRestaurantForSlug(restaurantSlug);

  const header = (
    <header className="h-16 border-b border-outline-variant flex items-center px-4 md:px-6 shrink-0">
      <h1 className="font-headline-sm text-headline-sm text-on-surface truncate">
        {restaurant.name} &middot; Transactions
      </h1>
    </header>
  );

  if (!isManagerOrAbove(staffMember.role)) {
    return (
      <div className="flex flex-col">
        {header}
        <p className="p-6 font-body-md text-body-md text-on-surface-variant">
          Transaction reporting is available to managers, admins, and owners.
        </p>
      </div>
    );
  }

  const range = resolveDateRange(query.from, query.to, new Date());
  const { transactions, summary, truncated } = await getTransactions(
    restaurant.id,
    range.fromIso,
    range.toIso,
  );

  const stats = [
    { label: "Collected", value: formatMoney(summary.grossCents), hint: `${summary.count} payments` },
    { label: "Tips", value: formatMoney(summary.tipsCents) },
    { label: "Tax collected", value: formatMoney(summary.taxCents) },
    { label: "Platform fees", value: formatMoney(summary.feesCents) },
    { label: "Net to restaurant", value: formatMoney(summary.netCents), hint: "before Stripe processing fees" },
    { label: "Refunded", value: formatMoney(summary.refundedCents) },
  ];

  return (
    <div className="flex flex-col min-h-[calc(100dvh-3.5rem)] md:min-h-dvh">
      {header}

      <main className="p-4 md:p-6 flex flex-col gap-6 w-full max-w-6xl">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <label className="flex flex-col gap-1">
            <span className="font-label-caps text-label-caps text-on-surface-variant">From</span>
            <input
              type="date"
              name="from"
              defaultValue={range.from}
              className="h-11 px-3 rounded border border-outline-variant bg-surface-container-lowest font-body-md text-body-md"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-label-caps text-label-caps text-on-surface-variant">To</span>
            <input
              type="date"
              name="to"
              defaultValue={range.to}
              className="h-11 px-3 rounded border border-outline-variant bg-surface-container-lowest font-body-md text-body-md"
            />
          </label>
          <Button type="submit" variant="primary">
            Apply
          </Button>
          <Button variant="outline" asChild>
            <a href={`/${restaurantSlug}/admin/analytics/export?from=${range.from}&to=${range.to}`}>
              <Icon name="download" className="text-lg" />
              Export CSV
            </a>
          </Button>
          <span className="font-body-sm text-body-sm text-on-surface-variant">Dates in UTC</span>
        </form>

        <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="p-4 rounded border border-outline-variant bg-surface-container-lowest flex flex-col gap-1"
            >
              <span className="font-label-caps text-label-caps text-on-surface-variant">{stat.label}</span>
              <span className="font-headline-sm text-headline-sm text-on-surface">{stat.value}</span>
              {stat.hint ? (
                <span className="font-body-sm text-body-sm text-on-surface-variant">{stat.hint}</span>
              ) : null}
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-label-caps text-label-caps text-on-surface-variant uppercase">
            Payments
          </h2>
          {truncated ? (
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Showing the most recent 1,000 — narrow the date range (or export) to see the rest.
            </p>
          ) : null}
          {transactions.length === 0 ? (
            <p className="font-body-md text-body-md text-on-surface-variant">
              No payments in this range.
            </p>
          ) : (
            <div className="overflow-x-auto border border-outline-variant rounded bg-surface-container-lowest">
              <table className="w-full min-w-[720px] font-body-sm text-body-sm">
                <thead className="bg-surface-container-high text-on-surface-variant text-left">
                  <tr>
                    <th className="px-3 py-2 font-label-caps text-label-caps">Time</th>
                    <th className="px-3 py-2 font-label-caps text-label-caps">Table</th>
                    <th className="px-3 py-2 font-label-caps text-label-caps">Card</th>
                    <th className="px-3 py-2 font-label-caps text-label-caps text-right">Amount</th>
                    <th className="px-3 py-2 font-label-caps text-label-caps text-right">Tip</th>
                    <th className="px-3 py-2 font-label-caps text-label-caps text-right">Total</th>
                    <th className="px-3 py-2 font-label-caps text-label-caps">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {transactions.map((t) => (
                    <tr key={t.id}>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {new Date(t.succeededAt ?? t.createdAt).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {t.tableLabel}
                        {t.splitMode !== "none" ? (
                          <span className="text-on-surface-variant"> · {portionLabel(t.splitMode, t.splitGroup)}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {t.cardLast4 ? `${t.cardBrand ?? "card"} •••• ${t.cardLast4}` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">{formatMoney(t.amountCents)}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(t.tipCents)}</td>
                      <td className="px-3 py-2 text-right font-label-lg text-label-lg">
                        {formatMoney(t.totalCents)}
                      </td>
                      <td className={cn("px-3 py-2 capitalize", STATUS_STYLE[t.status])}>{t.status}</td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href={`/${restaurantSlug}/billing/${t.checkId}/receipt?payment=${t.id}`}
                          className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                        >
                          Receipt
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
