import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/index.js", () => ({
  config: { OPENAI_API_KEY: "sk-live-key", OPENAI_BASE_URL: undefined, NODE_ENV: "test" },
}));

const mockCreate = vi.fn();
vi.mock("openai", () => ({
  default: class {
    audio = { transcriptions: { create: (...a: unknown[]) => mockCreate(...a) } };
  },
  toFile: async (b: Buffer, name: string) => ({ b, name }),
}));

import { transcribeForModeration } from "./voice-transcription.service.js";

const AUDIO = Buffer.from("audio");

describe("transcribeForModeration (fail-closed)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns trimmed text for a real transcription", async () => {
    mockCreate.mockResolvedValue({ text: "  hello there  " });
    expect(await transcribeForModeration(AUDIO)).toBe("hello there");
  });

  it("throws on an empty transcription (never returns '' that would pass moderation)", async () => {
    mockCreate.mockResolvedValue({ text: "" });
    await expect(transcribeForModeration(AUDIO)).rejects.toThrow(/empty/i);
  });

  it("throws on a whitespace-only transcription", async () => {
    mockCreate.mockResolvedValue({ text: "   \n\t " });
    await expect(transcribeForModeration(AUDIO)).rejects.toThrow(/empty/i);
  });

  it("throws on a malformed provider result (no text field)", async () => {
    mockCreate.mockResolvedValue({});
    await expect(transcribeForModeration(AUDIO)).rejects.toThrow(/empty/i);
  });

  it("throws on a provider error", async () => {
    mockCreate.mockRejectedValue(new Error("503"));
    await expect(transcribeForModeration(AUDIO)).rejects.toThrow();
  });
});

describe("transcribeForModeration in stub mode", () => {
  it("fails closed when there is no API key (cannot verify audio)", async () => {
    vi.resetModules();
    vi.doMock("../config/index.js", () => ({
      config: { OPENAI_API_KEY: "sk-stub-placeholder-key", NODE_ENV: "test" },
    }));
    const { transcribeForModeration: stub } = await import("./voice-transcription.service.js");
    await expect(stub(AUDIO)).rejects.toThrow(/unavailable/i);
    vi.doUnmock("../config/index.js");
  });
});
