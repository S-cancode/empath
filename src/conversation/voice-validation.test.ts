import { describe, it, expect } from "vitest";
import { validateVoicePayload } from "./voice-validation.js";

const AUDIO = Buffer.from("hello audio").toString("base64");

describe("validateVoicePayload", () => {
  it("accepts a well-formed payload and returns a decoded buffer", () => {
    const r = validateVoicePayload({ conversationId: "c1", audio: AUDIO, durationMs: 3000, waveform: [0, 0.5, 1] });
    expect(Buffer.isBuffer(r.audio)).toBe(true);
    expect(r.durationMs).toBe(3000);
    expect(r.waveform).toEqual([0, 0.5, 1]);
  });

  it("rejects a missing/empty conversation id", () => {
    expect(() => validateVoicePayload({ conversationId: "", audio: AUDIO, durationMs: 3000 })).toThrow(/conversation/i);
    expect(() => validateVoicePayload({ audio: AUDIO, durationMs: 3000 })).toThrow(/conversation/i);
  });

  it("rejects empty and malformed base64 audio", () => {
    expect(() => validateVoicePayload({ conversationId: "c1", audio: "", durationMs: 3000 })).toThrow(/audio/i);
    expect(() => validateVoicePayload({ conversationId: "c1", audio: "not base64 !!", durationMs: 3000 })).toThrow(/invalid/i);
  });

  it("rejects base64 over the char cap and decoded over the byte cap", () => {
    expect(() => validateVoicePayload({ conversationId: "c1", audio: "A".repeat(2_000_001), durationMs: 3000 })).toThrow(/too large/i);
    const bigDecoded = Buffer.alloc(1_600_001).toString("base64");
    expect(() => validateVoicePayload({ conversationId: "c1", audio: bigDecoded, durationMs: 3000 })).toThrow(/too large/i);
  });

  it("rejects zero, negative, non-integer and oversized duration", () => {
    for (const bad of [0, -1, 3.5, 60_001, "3000" as unknown as number]) {
      expect(() => validateVoicePayload({ conversationId: "c1", audio: AUDIO, durationMs: bad as number })).toThrow(/duration/i);
    }
  });

  it("rejects a waveform over 600 samples", () => {
    const wf = new Array(601).fill(0.5);
    expect(() => validateVoicePayload({ conversationId: "c1", audio: AUDIO, durationMs: 3000, waveform: wf })).toThrow(/waveform/i);
  });

  it("rejects non-finite and out-of-range waveform values", () => {
    for (const bad of [[-0.1], [1.1], [NaN], [Infinity], ["x" as unknown as number]]) {
      expect(() => validateVoicePayload({ conversationId: "c1", audio: AUDIO, durationMs: 3000, waveform: bad as number[] })).toThrow(/waveform/i);
    }
  });

  it("allows an absent waveform", () => {
    const r = validateVoicePayload({ conversationId: "c1", audio: AUDIO, durationMs: 3000 });
    expect(r.waveform).toBeUndefined();
  });
});
