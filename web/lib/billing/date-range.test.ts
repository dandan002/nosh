import { describe, expect, it } from "vitest";

import { resolveDateRange } from "./date-range";

const now = new Date("2026-11-07T15:00:00Z");

describe("resolveDateRange", () => {
  it("defaults to the last 7 days, inclusive of today", () => {
    expect(resolveDateRange(undefined, undefined, now)).toEqual({
      from: "2026-11-01",
      to: "2026-11-07",
      fromIso: "2026-11-01T00:00:00.000Z",
      toIso: "2026-11-08T00:00:00.000Z",
    });
  });

  it("swaps a reversed range and ignores garbage", () => {
    const r = resolveDateRange("2026-11-05", "2026-11-01", now);
    expect([r.from, r.to]).toEqual(["2026-11-01", "2026-11-05"]);
    expect(resolveDateRange("nope", "2026-13-45", now).to).toBe("2026-11-07");
  });

  it("caps very wide ranges", () => {
    const r = resolveDateRange("2000-01-01", "2026-11-07", now);
    expect(r.from).toBe("2025-11-06");
  });
});
