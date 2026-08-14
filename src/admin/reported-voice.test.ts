import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/index.js", () => ({
  config: { ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", NODE_ENV: "test" },
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: { report: { findUnique: vi.fn() }, message: { findUnique: vi.fn() } },
}));

import { getReportedVoiceAudio } from "./admin.service.js";
import { encrypt } from "../lib/crypto.js";
import { prisma } from "../lib/prisma.js";

const mockPrisma = vi.mocked(prisma);
const AUDIO = Buffer.from("secret audio").toString("base64");

function encVoice(overrides: Record<string, unknown> = {}) {
  const e = encrypt(AUDIO);
  return { conversationId: "conv-1", senderId: "reported", messageType: "voice", content: e.ciphertext, iv: e.iv, authTag: e.authTag, ...overrides };
}

describe("getReportedVoiceAudio (exact reported message only)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("decrypts audio ONLY for the exact reported message", async () => {
    (mockPrisma.report.findUnique as any).mockResolvedValue({ conversationId: "conv-1", reportedMessageId: "msg-1" });
    (mockPrisma.message.findUnique as any).mockResolvedValue(encVoice());
    const r = await getReportedVoiceAudio("report-1", "msg-1");
    expect(r.base64Audio).toBe(AUDIO);
  });

  it("refuses another voice note by the same sender (not the exact reported one)", async () => {
    (mockPrisma.report.findUnique as any).mockResolvedValue({ conversationId: "conv-1", reportedMessageId: "msg-1" });
    // messageId differs from reportedMessageId → refused without touching the message
    await expect(getReportedVoiceAudio("report-1", "msg-2")).rejects.toThrow(/not found/i);
    expect(mockPrisma.message.findUnique).not.toHaveBeenCalled();
  });

  it("refuses a conversation/user-level report with no exact reportedMessageId", async () => {
    (mockPrisma.report.findUnique as any).mockResolvedValue({ conversationId: "conv-1", reportedMessageId: null });
    await expect(getReportedVoiceAudio("report-1", "msg-1")).rejects.toThrow(/not found/i);
    expect(mockPrisma.message.findUnique).not.toHaveBeenCalled();
  });

  it("refuses when the exact message is in another conversation", async () => {
    (mockPrisma.report.findUnique as any).mockResolvedValue({ conversationId: "conv-1", reportedMessageId: "msg-1" });
    (mockPrisma.message.findUnique as any).mockResolvedValue(encVoice({ conversationId: "other" }));
    await expect(getReportedVoiceAudio("report-1", "msg-1")).rejects.toThrow(/not found/i);
  });

  it("refuses a non-voice exact message", async () => {
    (mockPrisma.report.findUnique as any).mockResolvedValue({ conversationId: "conv-1", reportedMessageId: "msg-1" });
    (mockPrisma.message.findUnique as any).mockResolvedValue(encVoice({ messageType: "text" }));
    await expect(getReportedVoiceAudio("report-1", "msg-1")).rejects.toThrow(/not found/i);
  });

  it("uses a uniform not-found error (never reveals unrelated audio exists)", async () => {
    (mockPrisma.report.findUnique as any).mockResolvedValue(null);
    await expect(getReportedVoiceAudio("ghost", "msg-1")).rejects.toThrow(/not found/i);
  });
});
