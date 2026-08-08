import { describe, it, expect } from "vitest";
import {
  validateMatchProfile,
  areCompatible,
  matchRationale,
  profileFromContext,
  MATCH_PROFILE_VERSION,
} from "./compatibility.js";

describe("validateMatchProfile", () => {
  it("returns undefined for an absent profile (backward compatible)", () => {
    expect(validateMatchProfile(undefined)).toBeUndefined();
    expect(validateMatchProfile(null)).toBeUndefined();
  });

  it("accepts valid enums and stamps the version", () => {
    const p = validateMatchProfile({ intent: "seek_support", interactionStyle: "ongoing", wantsAdvice: true });
    expect(p).toEqual({
      version: MATCH_PROFILE_VERSION,
      intent: "seek_support",
      interactionStyle: "ongoing",
      wantsAdvice: true,
    });
  });

  it("rejects an unknown intent enum server-side", () => {
    expect(() => validateMatchProfile({ intent: "vent_at_people" })).toThrow(/intent must be/);
  });

  it("rejects an unknown interactionStyle enum", () => {
    expect(() => validateMatchProfile({ interactionStyle: "forever" })).toThrow(/interactionStyle must be/);
  });

  it("rejects a non-boolean wantsAdvice", () => {
    expect(() => validateMatchProfile({ wantsAdvice: "yes" })).toThrow(/wantsAdvice/);
  });
});

describe("areCompatible (hard filter)", () => {
  it("treats missing profiles as compatible (pure similarity fallback)", () => {
    expect(areCompatible(undefined, undefined)).toBe(true);
    expect(areCompatible({ version: 1, intent: "seek_support" }, undefined)).toBe(true);
  });

  it("blocks two pure seekers", () => {
    expect(areCompatible(
      { version: 1, intent: "seek_support" },
      { version: 1, intent: "seek_support" },
    )).toBe(false);
  });

  it("blocks two pure offerers", () => {
    expect(areCompatible(
      { version: 1, intent: "offer_support" },
      { version: 1, intent: "offer_support" },
    )).toBe(false);
  });

  it("pairs a seeker with an offerer", () => {
    expect(areCompatible(
      { version: 1, intent: "seek_support" },
      { version: 1, intent: "offer_support" },
    )).toBe(true);
  });

  it("mutual is compatible with anyone", () => {
    expect(areCompatible({ version: 1, intent: "mutual" }, { version: 1, intent: "seek_support" })).toBe(true);
    expect(areCompatible({ version: 1, intent: "mutual" }, { version: 1, intent: "offer_support" })).toBe(true);
  });

  it("blocks one_off vs ongoing style mismatch", () => {
    expect(areCompatible(
      { version: 1, interactionStyle: "one_off" },
      { version: 1, interactionStyle: "ongoing" },
    )).toBe(false);
  });

  it("'either' style is compatible with both", () => {
    expect(areCompatible({ version: 1, interactionStyle: "either" }, { version: 1, interactionStyle: "ongoing" })).toBe(true);
  });

  it("requires ALL constraints to pass (intent ok but style mismatch → incompatible)", () => {
    expect(areCompatible(
      { version: 1, intent: "mutual", interactionStyle: "one_off" },
      { version: 1, intent: "mutual", interactionStyle: "ongoing" },
    )).toBe(false);
  });
});

describe("matchRationale", () => {
  it("gives a non-sensitive reason with no topic/health data", () => {
    const r = matchRationale(
      { version: 1, interactionStyle: "ongoing", intent: "mutual" },
      { version: 1, interactionStyle: "ongoing", intent: "seek_support" },
    );
    expect(r).toMatch(/ongoing/);
    expect(r).not.toMatch(/grief|health|suicid/i);
  });

  it("falls back to a generic reason when nothing specific is shared", () => {
    expect(matchRationale(undefined, undefined)).toBe("Matched on what you shared.");
  });
});

describe("profileFromContext", () => {
  it("extracts a profile nested under matchContext.profile", () => {
    expect(profileFromContext({ profile: { version: 1, intent: "mutual" } })).toEqual({ version: 1, intent: "mutual" });
  });
  it("returns undefined when there is no profile", () => {
    expect(profileFromContext({ summary: "x" })).toBeUndefined();
    expect(profileFromContext(null)).toBeUndefined();
  });
});
