import { describe, expect, it } from "vitest";

import { CreatePaymentSchema, SplitConfigSchema, TaxRateSchema } from "./billing";

describe("TaxRateSchema", () => {
  it("accepts up to two decimals", () => {
    expect(TaxRateSchema.safeParse({ taxRatePercent: "8.25" }).success).toBe(true);
    expect(TaxRateSchema.safeParse({ taxRatePercent: "0" }).success).toBe(true);
    expect(TaxRateSchema.safeParse({ taxRatePercent: "8.255" }).success).toBe(false);
    expect(TaxRateSchema.safeParse({ taxRatePercent: "-1" }).success).toBe(false);
    expect(TaxRateSchema.safeParse({ taxRatePercent: "abc" }).success).toBe(false);
  });
});

describe("SplitConfigSchema", () => {
  it("requires at least two portions for a real split", () => {
    expect(SplitConfigSchema.safeParse({ splitMode: "none", splitCount: 1 }).success).toBe(true);
    expect(SplitConfigSchema.safeParse({ splitMode: "even", splitCount: 1 }).success).toBe(false);
    expect(SplitConfigSchema.safeParse({ splitMode: "by_seat", splitCount: 4 }).success).toBe(true);
    expect(SplitConfigSchema.safeParse({ splitMode: "bogus", splitCount: 2 }).success).toBe(false);
  });
});

describe("CreatePaymentSchema", () => {
  const base = {
    checkId: "6f1c1a8e-8a0b-4d7e-9f0e-2c3b4a5d6e7f",
    splitGroup: 1,
    tipCents: 0,
  };

  it("allows a blank receipt email", () => {
    expect(CreatePaymentSchema.safeParse({ ...base, receiptEmail: "" }).success).toBe(true);
    expect(CreatePaymentSchema.safeParse({ ...base, receiptEmail: "a@b.co" }).success).toBe(true);
    expect(CreatePaymentSchema.safeParse({ ...base, receiptEmail: "nope" }).success).toBe(false);
  });

  it("rejects negative tips", () => {
    expect(CreatePaymentSchema.safeParse({ ...base, tipCents: -5 }).success).toBe(false);
  });
});
