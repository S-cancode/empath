import { describe, it, expect } from "vitest";
import { categories } from "./categories.data.js";

describe("categories", () => {
  it("has 8 categories", () => {
    expect(categories).toHaveLength(8);
  });

  it("each category has at least 3 sub-tags", () => {
    for (const cat of categories) {
      expect(cat.subTags.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("each category has required fields", () => {
    for (const cat of categories) {
      expect(cat.id).toBeTruthy();
      expect(cat.name).toBeTruthy();
      expect(cat.description).toBeTruthy();
      expect(Array.isArray(cat.subTags)).toBe(true);
    }
  });

  it("sub-tags have id and name", () => {
    for (const cat of categories) {
      for (const tag of cat.subTags) {
        expect(tag.id).toBeTruthy();
        expect(tag.name).toBeTruthy();
      }
    }
  });

  it("all category ids are unique", () => {
    const ids = categories.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes the correct core categories", () => {
    const ids = categories.map((c) => c.id);
    expect(ids).toContain("work-career");
    expect(ids).toContain("relationships");
    expect(ids).toContain("financial-stress");
    expect(ids).toContain("grief");
    expect(ids).toContain("academic-pressure");
    expect(ids).toContain("health");
    expect(ids).toContain("parenting");
    expect(ids).toContain("identity");
  });

  it("has premiumOnly sub-tags", () => {
    const allTags = categories.flatMap((c) => c.subTags);
    const premiumTags = allTags.filter((t) => t.premiumOnly);
    expect(premiumTags.length).toBeGreaterThan(0);
  });

  it("each category has at least one free sub-tag", () => {
    for (const cat of categories) {
      const freeTags = cat.subTags.filter((t) => !t.premiumOnly);
      expect(freeTags.length).toBeGreaterThanOrEqual(1);
    }
  });
});
