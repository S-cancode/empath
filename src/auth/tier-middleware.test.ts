import { describe, it, expect, vi } from "vitest";

vi.mock("../config/index.js", () => ({
  config: {
    JWT_SECRET: "test-jwt-secret-at-least-32-characters-long",
    JWT_REFRESH_SECRET: "test-refresh-secret-at-least-32-characters",
    ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    REDIS_URL: "redis://localhost:6379",
    PORT: 3000,
    NODE_ENV: "test",
  },
}));

import { requireTier, assertTier } from "./auth.middleware.js";
import { SubscriptionTier } from "../shared/types.js";
import { UpgradeRequiredError } from "../shared/errors.js";
import type { Request, Response, NextFunction } from "express";

function makeReq(tier?: string): Partial<Request> {
  return { user: tier ? { userId: "u1", tier } as any : undefined };
}

const res = {} as Response;

describe("requireTier middleware", () => {
  it("allows FREE when minimum is FREE", () => {
    const next = vi.fn();
    requireTier(SubscriptionTier.FREE)(makeReq("free") as Request, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("allows PREMIUM when minimum is FREE", () => {
    const next = vi.fn();
    requireTier(SubscriptionTier.FREE)(makeReq("premium") as Request, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("allows PLUS when minimum is PREMIUM", () => {
    const next = vi.fn();
    requireTier(SubscriptionTier.PREMIUM)(makeReq("plus") as Request, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("blocks FREE when minimum is PREMIUM", () => {
    const next = vi.fn();
    expect(() =>
      requireTier(SubscriptionTier.PREMIUM)(makeReq("free") as Request, res, next),
    ).toThrow(UpgradeRequiredError);
    expect(next).not.toHaveBeenCalled();
  });

  it("blocks PREMIUM when minimum is PLUS", () => {
    const next = vi.fn();
    expect(() =>
      requireTier(SubscriptionTier.PLUS)(makeReq("premium") as Request, res, next),
    ).toThrow(UpgradeRequiredError);
    expect(next).not.toHaveBeenCalled();
  });

  it("defaults to FREE when user has no tier", () => {
    const next = vi.fn();
    expect(() =>
      requireTier(SubscriptionTier.PREMIUM)(makeReq() as Request, res, next),
    ).toThrow(UpgradeRequiredError);
  });
});

describe("assertTier helper", () => {
  it("passes when tier meets minimum", () => {
    expect(() => assertTier("premium", SubscriptionTier.PREMIUM)).not.toThrow();
    expect(() => assertTier("plus", SubscriptionTier.FREE)).not.toThrow();
  });

  it("throws UpgradeRequiredError when tier is insufficient", () => {
    expect(() => assertTier("free", SubscriptionTier.PLUS)).toThrow(UpgradeRequiredError);
  });

  it("includes required tier in error", () => {
    try {
      assertTier("free", SubscriptionTier.PREMIUM);
    } catch (err) {
      expect(err).toBeInstanceOf(UpgradeRequiredError);
      expect((err as UpgradeRequiredError).requiredTier).toBe("premium");
    }
  });
});
