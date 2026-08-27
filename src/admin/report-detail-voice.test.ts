import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/index.js", () => ({
  config: { ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", NODE_ENV: "test" },
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    report: { findUnique: vi.fn(), count: vi.fn() },
    message: { findMany: vi.fn() },
  },
}));

import { getReportDetail } from "./admin.service.js";
import { encrypt } from "../lib/crypto.js";
import { prisma } from "../lib/prisma.js";

const mockPrisma = vi.mocked(prisma);
const AUDIO_B64 = Buffer.from("this is raw voice audio that must never leak").toString("base64");

describe("getReportDetail — voice content never leaks into JSON", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockPrisma.report.count as any).mockResolvedValue(0);
    (mockPrisma.report.findUnique as any).mockResolvedValue({
      id: "report-1",
      conversationId: "conv-1",
      reportedId: "reported",
      reason: "harassment",
      status: "pending",
      reportedMessageId: "vmsg-1",
      conversationLog: null, // forces the live-message fallback
      reporter: { id: "reporter", anonymousAlias: "A" },
      reported: { id: "reported", anonymousAlias: "B", banned: false, suspendedUntil: null },
      conversation: { id: "conv-1", category: "grief", subTag: null, status: "active", retentionHoldUntil: null },
      moderationActions: [],
    });
    // A live voice message whose encrypted content is the base64 audio.
    const enc = encrypt(AUDIO_B64);
    (mockPrisma.message.findMany as any).mockResolvedValue([
      {
        id: "vmsg-1",
        senderId: "reported",
        content: enc.ciphertext,
        iv: enc.iv,
        authTag: enc.authTag,
        messageType: "voice",
        sentAt: new Date(),
        sender: { id: "reported", anonymousAlias: "B" },
      },
    ]);
  });

  it("renders voice as [voice note] with an id, and no base64 audio anywhere in the payload", async () => {
    const detail = await getReportDetail("report-1");
    const voice = detail.messages.find((m: any) => m.messageType === "voice");
    expect(voice.content).toBe("[voice note]");
    expect(voice.id).toBe("vmsg-1"); // id present so the dashboard can offer playback
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain(AUDIO_B64);
  });
});
