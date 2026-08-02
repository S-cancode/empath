import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The config module validates env at import time, so each case stubs the env,
// resets the module registry, and imports a fresh copy.

const REQUIRED_ENV: Record<string, string> = {
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  REDIS_URL: "redis://localhost:6379",
  JWT_SECRET: "test-jwt-secret-at-least-32-characters-long",
  JWT_REFRESH_SECRET: "test-refresh-secret-at-least-32-characters",
  ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  NODE_ENV: "test",
};

function stubEnv(overrides: Record<string, string> = {}) {
  for (const [k, v] of Object.entries({ ...REQUIRED_ENV, ...overrides })) {
    vi.stubEnv(k, v);
  }
}

describe("AI processor guard", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as never);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    exitSpy.mockRestore();
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("refuses to boot with a namespaced (OpenRouter) model", async () => {
    stubEnv({ OPENROUTER_MODEL: "google/gemini-2.0-flash-001" });

    await expect(import("./index.js")).rejects.toThrow("process.exit called");
    expect(errorSpy.mock.calls.flat().join(" ")).toContain("not an approved data processor");
  });

  it("refuses to boot with an unapproved base URL", async () => {
    stubEnv({
      OPENROUTER_MODEL: "gpt-4o-mini",
      OPENAI_BASE_URL: "https://openrouter.ai/api/v1",
    });

    await expect(import("./index.js")).rejects.toThrow("process.exit called");
    expect(errorSpy.mock.calls.flat().join(" ")).toContain("not an approved AI processor endpoint");
  });

  it("boots with the default OpenAI configuration and logs the AI destination", async () => {
    stubEnv({ OPENROUTER_MODEL: "gpt-4o-mini" });

    const { config } = await import("./index.js");

    expect(config.OPENROUTER_MODEL).toBe("gpt-4o-mini");
    expect(config.OPENAI_BASE_URL).toBeUndefined();
    const logged = logSpy.mock.calls.flat().join(" ");
    expect(logged).toContain("[ai] endpoint:");
    expect(logged).toContain("api.openai.com");
  });

  it("accepts an explicitly approved base URL", async () => {
    stubEnv({
      OPENROUTER_MODEL: "gpt-4o-mini",
      OPENAI_BASE_URL: "https://api.openai.com/v1",
    });

    const { config } = await import("./index.js");
    expect(config.OPENAI_BASE_URL).toBe("https://api.openai.com/v1");
  });
});
