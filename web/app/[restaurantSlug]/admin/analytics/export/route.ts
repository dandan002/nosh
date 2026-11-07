import { NextResponse, type NextRequest } from "next/server";

import { getRestaurantForSlug, isManagerOrAbove } from "@/lib/data/restaurant";
import { getTransactions } from "@/lib/data/billing";
import { resolveDateRange } from "@/lib/billing/date-range";

function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  // Quote everything and neutralize spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

const dollars = (cents: number) => (cents / 100).toFixed(2);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ restaurantSlug: string }> },
) {
  const { restaurantSlug } = await params;
  const { restaurant, staffMember } = await getRestaurantForSlug(restaurantSlug);
  if (!isManagerOrAbove(staffMember.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const range = resolveDateRange(
    request.nextUrl.searchParams.get("from") ?? undefined,
    request.nextUrl.searchParams.get("to") ?? undefined,
    new Date(),
  );
  const { transactions } = await getTransactions(restaurant.id, range.fromIso, range.toIso);

  const header = [
    "payment_id",
    "check_id",
    "created_at",
    "succeeded_at",
    "table",
    "split_mode",
    "portion",
    "status",
    "card_brand",
    "card_last4",
    "amount",
    "tip",
    "total",
    "platform_fee",
  ];
  const rows = transactions.map((t) =>
    [
      t.id,
      t.checkId,
      t.createdAt,
      t.succeededAt,
      t.tableLabel,
      t.splitMode,
      t.splitGroup,
      t.status,
      t.cardBrand,
      t.cardLast4,
      dollars(t.amountCents),
      dollars(t.tipCents),
      dollars(t.totalCents),
      dollars(t.applicationFeeCents),
    ]
      .map(csvCell)
      .join(","),
  );

  return new NextResponse([header.join(","), ...rows].join("\n") + "\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${restaurant.slug}-transactions-${range.from}-to-${range.to}.csv"`,
    },
  });
}
