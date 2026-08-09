// The client voice-send ack resolver is pure TS (no React Native imports), so
// vitest runs it directly from the client tree — same pattern as
// translationDisplay.test.ts.
import { describe, it, expect } from "vitest";
import { resolveVoiceAck } from "../../client/src/lib/voice-send";

describe("resolveVoiceAck (client helper)", () => {
  it("treats a timeout/transport error as retryable, never success", () => {
    const o = resolveVoiceAck(new Error("operation has timed out"));
    expect(o.state).toBe("retry");
    expect(o.refetch).toBe(false);
  });

  it("maps a sent ack to success + refetch", () => {
    expect(resolveVoiceAck(null, { status: "sent" })).toEqual({ state: "sent", refetch: true });
  });

  it("maps an explicit retry ack", () => {
    const o = resolveVoiceAck(null, { status: "retry", message: "provider busy" });
    expect(o.state).toBe("retry");
    expect(o.message).toBe("provider busy");
  });

  it("maps a rejected ack and never refetches", () => {
    expect(resolveVoiceAck(null, { status: "rejected", message: "blocked" }).state).toBe("rejected");
  });

  it("defaults an unknown/missing ack to rejected (never claims success)", () => {
    expect(resolveVoiceAck(null, null).state).toBe("rejected");
    expect(resolveVoiceAck(null, {}).state).toBe("rejected");
  });
});
