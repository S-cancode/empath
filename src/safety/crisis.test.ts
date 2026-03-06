import { describe, it, expect } from "vitest";
import { detectCrisis } from "./crisis.detector.js";

describe("crisis.detector", () => {
  it("detects direct keyword", () => {
    const result = detectCrisis("I've been thinking about suicide");
    expect(result.detected).toBe(true);
    expect(result.matchedKeywords).toContain("suicide");
  });

  it("detects pattern: I want to end it", () => {
    const result = detectCrisis("I just want to end it all");
    expect(result.detected).toBe(true);
  });

  it("detects pattern: no reason to live", () => {
    const result = detectCrisis("There's no reason to live anymore");
    expect(result.detected).toBe(true);
  });

  it("detects pattern: can't go on anymore", () => {
    const result = detectCrisis("I can't go on anymore");
    expect(result.detected).toBe(true);
  });

  it("detects pattern: better off dead", () => {
    const result = detectCrisis("Everyone would be better off dead");
    expect(result.detected).toBe(true);
  });

  it("detects pattern: I don't want to be here", () => {
    const result = detectCrisis("I don't want to be here anymore");
    expect(result.detected).toBe(true);
  });

  it("detects self-harm keywords", () => {
    const result = detectCrisis("I've been cutting myself");
    expect(result.detected).toBe(true);
    expect(result.matchedKeywords).toContain("cutting myself");
  });

  it("does NOT flag normal conversation", () => {
    expect(detectCrisis("I'm feeling a bit down today").detected).toBe(false);
    expect(detectCrisis("Work has been really stressful").detected).toBe(false);
    expect(detectCrisis("I miss my friend").detected).toBe(false);
    expect(detectCrisis("I need someone to talk to").detected).toBe(false);
  });

  it("deduplicates matched keywords", () => {
    const result = detectCrisis("I want to kill myself, thinking about suicide and killing myself");
    expect(result.detected).toBe(true);
    const unique = new Set(result.matchedKeywords);
    expect(unique.size).toBe(result.matchedKeywords.length);
  });

  it("is case insensitive for keywords", () => {
    const result = detectCrisis("SUICIDE is not the answer");
    expect(result.detected).toBe(true);
  });
});
