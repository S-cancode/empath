import { describe, it, expect, vi } from "vitest";

// Import-chain mocks only — these tests inspect middleware wiring, they never
// execute handlers.
vi.mock("../config/index.js", () => ({
  config: {
    JWT_SECRET: "test-jwt-secret-at-least-32-characters-long",
    JWT_REFRESH_SECRET: "test-refresh-secret-at-least-32-characters",
    ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    OPENAI_API_KEY: "sk-stub-placeholder-key",
    OPENROUTER_MODEL: "gpt-4o-mini",
    NODE_ENV: "test",
  },
}));
vi.mock("../lib/prisma.js", () => ({ prisma: {} }));
vi.mock("../lib/redis.js", () => ({
  // rate-limit-redis loads Lua scripts at construction and expects a SHA
  // string back; anything else raises an unhandled rejection.
  redis: {
    call: vi.fn(async () => "0".repeat(40)),
    sendCommand: vi.fn(async () => "0".repeat(40)),
    eval: vi.fn(),
    defineCommand: vi.fn(),
  },
}));

import { analyseRouter } from "../analyse/analyse.router.js";
import { matchingRouter } from "../matching/matching.router.js";

interface Layer {
  name: string;
  route?: { path: string; stack: Layer[] };
}

function routeMiddlewareNames(router: { stack: Layer[] }, path: string): string[] {
  const names: string[] = [];
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === path) {
      names.push(...layer.route.stack.map((l) => l.name));
    } else if (!layer.route) {
      names.push(layer.name); // router-level middleware
    }
  }
  return names;
}

describe("compliance middleware wiring", () => {
  it("POST /match/analyse runs requireCompliance before its handler", () => {
    const names = routeMiddlewareNames(analyseRouter as never, "/");
    expect(names).toContain("requireCompliance");
  });

  it("matching router keeps requireCompliance at router level", () => {
    const names = (matchingRouter as never as { stack: Layer[] }).stack
      .filter((l) => !l.route)
      .map((l) => l.name);
    expect(names).toContain("requireCompliance");
  });
});
