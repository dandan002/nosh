// Pure billing math shared by the check screen (display), the payment
// Server Action (authoritative amount to charge) and the webhook/finalize
// path (deciding whether a check is fully paid). Kept free of Supabase and
// Stripe so it can be unit-tested directly — see split.test.ts.
//
// All amounts are integer cents. Rounding is always resolved with a
// largest-remainder allocation so portions add up *exactly* to the check
// total — no cent is ever lost or invented by splitting.

export type SplitMode = "none" | "even" | "by_seat" | "by_item";

export const SPLIT_MODES: readonly SplitMode[] = ["none", "even", "by_seat", "by_item"];

export const MAX_SPLIT_COUNT = 30;

export type BillableLine = {
  id: string;
  amountCents: number;
  splitGroup: number | null;
};

export type Portion = {
  group: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  itemIds: string[];
};

export type CheckBreakdown = {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  portions: Portion[];
  // Only non-empty for by_seat/by_item: items not yet assigned to any
  // portion. A check can't be paid until this is empty, otherwise those
  // items would silently go unpaid.
  unassignedItemIds: string[];
};

// Basis points: 825 bps = 8.25%. Half-up rounding to the cent.
export function taxForSubtotal(subtotalCents: number, taxRateBps: number): number {
  return Math.round((subtotalCents * taxRateBps) / 10_000);
}

// Distributes `total` across buckets in proportion to `weights`, using the
// largest-remainder method so the result sums to exactly `total`. Ties go
// to the earlier bucket (so an even split of 1000 three ways is
// [334, 333, 333]). All-zero weights fall back to an even split.
export function allocateProportionally(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  const effective = weightSum > 0 ? weights : weights.map(() => 1);
  const effectiveSum = weightSum > 0 ? weightSum : weights.length;

  const exact = effective.map((w) => (total * w) / effectiveSum);
  const floors = exact.map((value) => Math.floor(value));
  let remainder = total - floors.reduce((sum, v) => sum + v, 0);

  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);

  for (const { index } of order) {
    if (remainder <= 0) break;
    floors[index] += 1;
    remainder -= 1;
  }
  return floors;
}

export function computeCheckBreakdown({
  lines,
  taxRateBps,
  splitMode,
  splitCount,
}: {
  lines: BillableLine[];
  taxRateBps: number;
  splitMode: SplitMode;
  splitCount: number;
}): CheckBreakdown {
  const subtotalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
  const taxCents = taxForSubtotal(subtotalCents, taxRateBps);
  const totalCents = subtotalCents + taxCents;
  const count = splitMode === "none" ? 1 : Math.max(1, Math.min(MAX_SPLIT_COUNT, splitCount));
  const groups = Array.from({ length: count }, (_, i) => i + 1);

  if (splitMode === "none" || splitMode === "even") {
    // Allocate the *total* evenly (so guests pay as close to the same
    // amount as possible) and derive each share's tax as total - subtotal.
    const totals = allocateProportionally(totalCents, groups.map(() => 1));
    const subtotals = allocateProportionally(subtotalCents, groups.map(() => 1));
    return {
      subtotalCents,
      taxCents,
      totalCents,
      unassignedItemIds: [],
      portions: groups.map((group, i) => ({
        group,
        subtotalCents: subtotals[i],
        taxCents: totals[i] - subtotals[i],
        totalCents: totals[i],
        // An even split doesn't assign items; every portion covers a share
        // of all of them.
        itemIds: lines.map((line) => line.id),
      })),
    };
  }

  // by_seat / by_item: each portion pays for exactly the items assigned to
  // it. Tax is the check-level tax allocated by each portion's subtotal
  // (rather than taxing each portion independently), so the portions'
  // tax always sums to the same tax the check shows.
  const unassignedItemIds: string[] = [];
  const itemIdsByGroup = new Map<number, string[]>(groups.map((g) => [g, []]));
  const subtotalByGroup = new Map<number, number>(groups.map((g) => [g, 0]));

  for (const line of lines) {
    if (line.splitGroup === null || !itemIdsByGroup.has(line.splitGroup)) {
      unassignedItemIds.push(line.id);
      continue;
    }
    itemIdsByGroup.get(line.splitGroup)!.push(line.id);
    subtotalByGroup.set(line.splitGroup, subtotalByGroup.get(line.splitGroup)! + line.amountCents);
  }

  const assignedSubtotals = groups.map((g) => subtotalByGroup.get(g)!);
  const assignedSubtotal = assignedSubtotals.reduce((sum, v) => sum + v, 0);
  // Until everything is assigned, show each portion's own share of tax on
  // what it has so far; once fully assigned this equals the allocation of
  // the check-level tax.
  const taxPool =
    unassignedItemIds.length === 0 ? taxCents : taxForSubtotal(assignedSubtotal, taxRateBps);
  const taxes =
    assignedSubtotal > 0
      ? allocateProportionally(taxPool, assignedSubtotals)
      : groups.map(() => 0);

  return {
    subtotalCents,
    taxCents,
    totalCents,
    unassignedItemIds,
    portions: groups.map((group, i) => ({
      group,
      subtotalCents: assignedSubtotals[i],
      taxCents: taxes[i],
      totalCents: assignedSubtotals[i] + taxes[i],
      itemIds: itemIdsByGroup.get(group)!,
    })),
  };
}

// A check is settled once every portion that actually owes money has a
// succeeded payment. Zero-total portions (e.g. a seat with nothing
// assigned) don't need one.
export function isCheckFullyPaid(
  breakdown: CheckBreakdown,
  paidGroups: Iterable<number>,
): boolean {
  if (breakdown.unassignedItemIds.length > 0) return false;
  const paid = new Set(paidGroups);
  return breakdown.portions.every((p) => p.totalCents === 0 || paid.has(p.group));
}

// The platform's application fee on a payment, in basis points of the
// portion amount (tips excluded — they pass straight through to the
// restaurant).
export function applicationFeeFor(amountCents: number, feeBps: number): number {
  return Math.max(0, Math.round((amountCents * feeBps) / 10_000));
}

// Tip presets are a percentage of the pre-tax subtotal, the common US
// convention.
export const TIP_PRESET_PERCENTS = [15, 18, 20, 25] as const;

export function tipForPercent(subtotalCents: number, percent: number): number {
  return Math.round((subtotalCents * percent) / 100);
}

export function formatMoney(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export function portionLabel(splitMode: SplitMode, group: number): string {
  switch (splitMode) {
    case "none":
      return "Full check";
    case "even":
      return `Share ${group}`;
    case "by_seat":
      return `Seat ${group}`;
    case "by_item":
      return `Guest ${group}`;
  }
}
