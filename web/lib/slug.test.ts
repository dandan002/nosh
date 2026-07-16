import { describe, expect, it } from "vitest";

import { slugify } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("The Cedar Room")).toBe("the-cedar-room");
  });

  it("strips punctuation", () => {
    expect(slugify("Joe's Café!")).toBe("joe-s-caf");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  --Rev--  ")).toBe("rev");
  });
});
