import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Guards the App Store review build configuration in client/eas.json:
//  - store-review must produce a store artifact (NOT internal distribution),
//  - it must target the production backend and enable review mode,
//  - and no review access secret may be compiled into the binary.
const eas = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "client", "eas.json"), "utf-8"),
) as {
  build: Record<string, { extends?: string; distribution?: string; env?: Record<string, string> }>;
};

/** Resolve a build profile's effective distribution/env across `extends`. */
function resolveProfile(name: string): { distribution?: string; env: Record<string, string> } {
  const chain: string[] = [];
  let cur: string | undefined = name;
  while (cur && !chain.includes(cur)) {
    chain.push(cur);
    cur = eas.build[cur]?.extends;
  }
  // Walk parent → child so child overrides win.
  let distribution: string | undefined;
  let env: Record<string, string> = {};
  for (const p of chain.reverse()) {
    const prof = eas.build[p];
    if (prof.distribution !== undefined) distribution = prof.distribution;
    env = { ...env, ...(prof.env ?? {}) };
  }
  return { distribution, env };
}

describe("eas.json — App Store review build profile", () => {
  it("defines a store-review profile", () => {
    expect(eas.build["store-review"]).toBeTruthy();
  });

  it("store-review is a store artifact, not internal/ad-hoc distribution", () => {
    const { distribution } = resolveProfile("store-review");
    // Store distribution is either the explicit "store" or the EAS default
    // (unset). It must NOT be "internal".
    expect(distribution).not.toBe("internal");
  });

  it("store-review targets the production backend", () => {
    const { env } = resolveProfile("store-review");
    expect(env.EXPO_PUBLIC_API_URL).toBe("https://empath-production.up.railway.app");
  });

  it("store-review enables review mode", () => {
    const { env } = resolveProfile("store-review");
    expect(env.EXPO_PUBLIC_REVIEW_MODE).toBe("true");
  });

  it("no build profile compiles a review access secret into the client", () => {
    for (const [name, prof] of Object.entries(eas.build)) {
      for (const key of Object.keys(prof.env ?? {})) {
        // The reviewer access CODE is server-only; nothing secret-looking may
        // ride along in a public (EXPO_PUBLIC_*) build var.
        expect(key, `${name}.env.${key} looks like a compiled-in secret`).not.toMatch(
          /(ACCESS_CODE|REVIEW_ACCESS|REVIEW_CODE|SECRET|PRIVATE_KEY)/i,
        );
      }
    }
    // And the code must not appear anywhere in eas.json at all.
    const raw = readFileSync(join(__dirname, "..", "..", "client", "eas.json"), "utf-8");
    expect(raw).not.toMatch(/REVIEW_ACCESS_CODE/);
  });

  it("the internal preview/review profiles are NOT what gets submitted", () => {
    // Sanity: the legacy internal "review" profile stays internal (fine for
    // internal QA) but is not a store artifact.
    if (eas.build["review"]) {
      expect(resolveProfile("review").distribution).toBe("internal");
    }
  });
});
