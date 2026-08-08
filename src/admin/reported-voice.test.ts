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

describe("getReportedVoiceAudio", () => {
  beforeEach(() => vi.clearAllMocks());

  it("decrypts audio for the exact reported message", async () => {
    (mockPrisma.report.findUnique as any).mockResolvedValue({ conversationId: "conv-1", reportedId: "reported", reportedMessageId: "msg-1" });
    (mockPrisma.message.findUnique as any).mockResolvedValue(encVoice());
    const r = await getReportedVoiceAudio("report-1", "msg-1");
    expect(r.base64Audio).toBe(AUDIO);
  });

  it("allows a voice from the report's conversation + reported sender (fallback)", async () => {
    (mockPrisma.report.findUnique as any).mockResolvedValue({ conversationId: "conv-1", reportedId: "reported", reportedMessageId: null });
    (mockPrisma.message.findUnique as any).mockResolvedValue(encVoice());
    const r = await getReportedVoiceAudio("report-1", "msg-2");
    expect(r.base64Audio).toBe(AUDIO);
  });

  it("refuses a message from a different conversation (not browsable)", async () => {
    (mockPrisma.report.findUnique as any).mockResolvedValue({ conversationId: "conv-1", reportedId: "reported", reportedMessageId: null });
    (mockPrisma.message.findUnique as any).mockResolvedValue(encVoice({ conversationId: "other" }));
    await expect(getReportedVoiceAudio("report-1", "msg-3")).rejects.toThrow(/not part of the report/i);
  });

  it("refuses a non-voice message", async () => {
    (mockPrisma.report.findUnique as any).mockResolvedValue({ conversationId: "conv-1", reportedId: "reported", reportedMessageId: "msg-1" });
    (mockPrisma.message.findUnique as any).mockResolvedValue(encVoice({ messageType: "text" }));
    await expect(getReportedVoiceAudio("report-1", "msg-1")).rejects.toThrow(/not found/i);
  });

  it("refuses when the report does not exist", async () => {
    (mockPrisma.report.findUnique as any).mockResolvedValue(null);
    await expect(getReportedVoiceAudio("ghost", "msg-1")).rejects.toThrow(/Report not found/i);
  });
});
