import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/index.js", () => ({
  config: {
    OPENAI_API_KEY: "sk-live-key",
    OPENAI_BASE_URL: undefined,
    NODE_ENV: "test",
  },
}));

const mockCreate = vi.fn();
vi.mock("openai", () => ({
  default: class {
    moderations = { create: (...a: unknown[]) => mockCreate(...a) };
  },
}));

import { moderateText } from "./content-moderation.service.js";

function apiResult(flagged: boolean, categories: Record<string, boolean> = {}) {
  return { results: [{ flagged, categories }] };
}

describe("moderateText", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows benign text", async () => {
    mockCreate.mockResolvedValue(apiResult(false));
    const r = await moderateText("I've been feeling low but talking helps.");
    expect(r.action).toBe("allow");
    expect(r.allowed).toBe(true);
  });

  it("blocks harassment/threats flagged by the classifier", async () => {
    mockCreate.mockResolvedValue(apiResult(true, { harassment: true, "harassment/threatening": true }));
    const r = await moderateText("you are worthless and I will find you");
    expect(r.action).toBe("block");
    expect(r.allowed).toBe(false);
    expect(r.categories).toContain("harassment");
  });

  it("blocks sexual content", async () => {
    mockCreate.mockResolvedValue(apiResult(true, { sexual: true }));
    const r = await moderateText("[explicit]");
    expect(r.action).toBe("block");
    expect(r.categories).toContain("sexual");
  });

  it("does NOT block self-harm by the sender (that is crisis support, not a violation)", async () => {
    // A user expressing their own distress must never be blocked from sending —
    // crisis detection handles that path with resources.
    mockCreate.mockResolvedValue(apiResult(true, { "self-harm": true, "self-harm/intent": true }));
    const r = await moderateText("I don't want to be here anymore");
    expect(r.action).toBe("allow");
  });

  it("blocks self-harm ENCOURAGEMENT directed outward", async () => {
    mockCreate.mockResolvedValue(apiResult(true, { "self-harm/instructions": true }));
    const r = await moderateText("[instructions]");
    expect(r.action).toBe("block");
    expect(r.categories).toContain("self-harm/instructions");
  });

  it("quarantines (does not deliver) when the classifier times out", async () => {
    mockCreate.mockImplementation(() => new Promise((_res, rej) => setTimeout(() => rej(new Error("timeout")), 5)));
    const r = await moderateText("anything");
    expect(r.action).toBe("quarantine");
    expect(r.allowed).toBe(false);
  });

  it("quarantines when the classifier errors (fail closed, never silently deliver)", async () => {
    mockCreate.mockRejectedValue(new Error("503"));
    const r = await moderateText("anything");
    expect(r.action).toBe("quarantine");
    expect(r.allowed).toBe(false);
  });

  it("returns no raw message content in its result (analytics/log safety)", async () => {
    mockCreate.mockResolvedValue(apiResult(true, { hate: true }));
    const r = await moderateText("some hateful sentence with identifying details");
    expect(JSON.stringify(r)).not.toContain("identifying details");
  });

  it("allows empty/whitespace without calling the classifier", async () => {
    const r = await moderateText("   ");
    expect(r.action).toBe("allow");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("moderateText stub mode (no API key)", () => {
  it("falls back to a local heuristic that still blocks obvious outward threats", async () => {
    // Re-mock config to stub mode for this isolated import.
    vi.resetModules();
    vi.doMock("../config/index.js", () => ({
      config: { OPENAI_API_KEY: "sk-stub-placeholder-key", NODE_ENV: "test" },
    }));
    const { moderateText: stubModerate } = await import("./content-moderation.service.js");
    const r = await stubModerate("kill yourself you worthless piece of trash");
    expect(r.action).toBe("block");
    vi.doUnmock("../config/index.js");
  });
});
