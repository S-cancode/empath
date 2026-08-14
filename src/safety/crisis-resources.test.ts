import { describe, it, expect } from "vitest";
import { getCrisisResources, internationalResources } from "./crisis.resources.js";

describe("getCrisisResources (country-aware)", () => {
  it("returns UK resources plus the international fallback for GB", () => {
    const r = getCrisisResources("GB");
    expect(r.some((x) => x.country === "UK")).toBe(true);
    expect(r.some((x) => x.country === "INTL")).toBe(true);
  });

  it("returns US resources plus the international fallback for US", () => {
    const r = getCrisisResources("US");
    expect(r.some((x) => x.country === "US")).toBe(true);
    expect(r.some((x) => x.country === "INTL")).toBe(true);
  });

  it("returns ONLY the international fallback for an unknown country", () => {
    expect(getCrisisResources("ZZ")).toEqual(internationalResources);
  });

  it("returns the international fallback when country is null/undefined (travel/unknown)", () => {
    expect(getCrisisResources(null)).toEqual(internationalResources);
    expect(getCrisisResources(undefined)).toEqual(internationalResources);
  });

  it("is case-insensitive on the country code", () => {
    expect(getCrisisResources("gb").some((x) => x.country === "UK")).toBe(true);
  });
});
