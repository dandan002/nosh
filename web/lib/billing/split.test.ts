import { describe, expect, it } from "vitest";

import {
  allocateProportionally,
  applicationFeeFor,
  computeCheckBreakdown,
  isCheckFullyPaid,
  taxForSubtotal,
  tipForPercent,
} from "./split";

const lines = (amounts: number[], groups: (number | null)[] = []) =>
  amounts.map((amountCents, i) => ({
    id: `item-${i}`,
    amountCents,
    splitGroup: groups[i] ?? null,
  }));

describe("taxForSubtotal", () => {
  it("applies basis points with half-up rounding", () => {
    expect(taxForSubtotal(1000, 825)).toBe(83); // 82.5 -> 83
    expect(taxForSubtotal(1999, 800)).toBe(160); // 159.92
    expect(taxForSubtotal(0, 825)).toBe(0);
    expect(taxForSubtotal(1234, 0)).toBe(0);
  });
});

describe("allocateProportionally", () => {
  it("always sums to the total", () => {
    for (const total of [0, 1, 99, 1000, 12345]) {
      for (const weights of [[1, 1, 1], [5, 3], [1, 0, 2, 7], [0, 0]]) {
        const parts = allocateProportionally(total, weights);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      }
    }
  });

  it("gives leftover cents to the earliest buckets on ties", () => {
    expect(allocateProportionally(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(allocateProportionally(2, [1, 1, 1])).toEqual([1, 1, 0]);
  });

  it("splits proportionally", () => {
    expect(allocateProportionally(100, [3, 1])).toEqual([75, 25]);
  });

  it("falls back to an even split for all-zero weights", () => {
    expect(allocateProportionally(10, [0, 0])).toEqual([5, 5]);
  });
});

describe("computeCheckBreakdown", () => {
  it("none: one portion for the whole check", () => {
    const result = computeCheckBreakdown({
      lines: lines([1000, 550]),
      taxRateBps: 800,
      splitMode: "none",
      splitCount: 4, // ignored
    });
    expect(result.subtotalCents).toBe(1550);
    expect(result.taxCents).toBe(124);
    expect(result.totalCents).toBe(1674);
    expect(result.portions).toHaveLength(1);
    expect(result.portions[0]).toMatchObject({ group: 1, totalCents: 1674 });
  });

  it("even: portions sum exactly to the total", () => {
    const result = computeCheckBreakdown({
      lines: lines([1000]),
      taxRateBps: 825,
      splitMode: "even",
      splitCount: 3,
    });
    expect(result.totalCents).toBe(1083);
    expect(result.portions.map((p) => p.totalCents)).toEqual([361, 361, 361]);
    expect(result.portions.reduce((s, p) => s + p.totalCents, 0)).toBe(result.totalCents);
  });

  it("by_seat: each portion pays its own items plus a proportional tax share", () => {
    const result = computeCheckBreakdown({
      lines: lines([1000, 500, 500], [1, 2, 2]),
      taxRateBps: 1000,
      splitMode: "by_seat",
      splitCount: 3,
    });
    expect(result.unassignedItemIds).toEqual([]);
    expect(result.portions.map((p) => p.subtotalCents)).toEqual([1000, 1000, 0]);
    expect(result.portions.map((p) => p.taxCents)).toEqual([100, 100, 0]);
    expect(result.portions.reduce((s, p) => s + p.totalCents, 0)).toBe(result.totalCents);
  });

  it("by_item: tax allocation never loses a cent", () => {
    const result = computeCheckBreakdown({
      lines: lines([333, 333, 334], [1, 2, 3]),
      taxRateBps: 875,
      splitMode: "by_item",
      splitCount: 3,
    });
    expect(result.portions.reduce((s, p) => s + p.taxCents, 0)).toBe(result.taxCents);
    expect(result.portions.reduce((s, p) => s + p.totalCents, 0)).toBe(result.totalCents);
  });

  it("reports unassigned items, including ones assigned past split_count", () => {
    const result = computeCheckBreakdown({
      lines: lines([100, 200, 300], [1, null, 5]),
      taxRateBps: 0,
      splitMode: "by_item",
      splitCount: 2,
    });
    expect(result.unassignedItemIds).toEqual(["item-1", "item-2"]);
  });
});

describe("isCheckFullyPaid", () => {
  it("requires every non-zero portion to be paid", () => {
    const breakdown = computeCheckBreakdown({
      lines: lines([1000, 500], [1, 2]),
      taxRateBps: 0,
      splitMode: "by_seat",
      splitCount: 3,
    });
    expect(isCheckFullyPaid(breakdown, [1])).toBe(false);
    // Seat 3 has nothing assigned, so it doesn't need a payment.
    expect(isCheckFullyPaid(breakdown, [1, 2])).toBe(true);
  });

  it("is never paid while items are unassigned", () => {
    const breakdown = computeCheckBreakdown({
      lines: lines([1000, 500], [1, null]),
      taxRateBps: 0,
      splitMode: "by_item",
      splitCount: 2,
    });
    expect(isCheckFullyPaid(breakdown, [1, 2])).toBe(false);
  });
});

describe("fees and tips", () => {
  it("computes the application fee in basis points", () => {
    expect(applicationFeeFor(10_000, 100)).toBe(100);
    expect(applicationFeeFor(1083, 290)).toBe(31);
    expect(applicationFeeFor(500, 0)).toBe(0);
  });

  it("computes percentage tips on the pre-tax subtotal", () => {
    expect(tipForPercent(4250, 18)).toBe(765);
    expect(tipForPercent(1999, 15)).toBe(300);
  });
});
