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

// Real container signatures (server sniffs the decrypted bytes).
const WAV = Buffer.concat([
  Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WAVE"), Buffer.from([0, 0, 0, 0]),
]).toString("base64");
const MP4 = Buffer.concat([
  Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftyp"), Buffer.from("M4A "),
]).toString("base64");
const GARBAGE = Buffer.from("not a real audio container at all").toString("base64");

function encVoice(audioBase64: string, overrides: Record<string, unknown> = {}) {
  const e = encrypt(audioBase64);
  return { conversationId: "conv-1", senderId: "reported", messageType: "voice", content: e.ciphertext, iv: e.iv, authTag: e.authTag, ...overrides };
}

describe("getReportedVoiceAudio (exact reported message only)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("decrypts audio ONLY for the exact reported message, with the sniffed MIME", async () => {
    (mockPrisma.report.findUnique as any).mockResolvedValue({ conversationId: "conv-1", reportedMessageId: "msg-1" });
    (mockPrisma.message.findUnique as any).mockResolvedValue(encVoice(MP4));
    const r = await getReportedVoiceAudio("report-1", "msg-1");
    expect(r.base64Audio).toBe(MP4);
    expect(r.mimeType).toBe("audio/mp4");
  });

  it("serves the seeded WAV fixture as audio/wav (not a guessed audio/mp4)", async () => {
    (mockPrisma.report.findUnique as any).mockResolvedValue({ conversationId: "conv-1", reportedMessageId: "msg-1" });
    (mockPrisma.message.findUnique as any).mockResolvedValue(encVoice(WAV));
    const r = await getReportedVoiceAudio("report-1", "msg-1");
    expect(r.mimeType).toBe("audio/wav");
  });

  it("fails safe on unsupported/malformed audio (never served under a guessed type)", async () => {
    (mockPrisma.report.findUnique as any).mockResolvedValue({ conversationId: "conv-1", reportedMessageId: "msg-1" });
    (mockPrisma.message.findUnique as any).mockResolvedValue(encVoice(GARBAGE));
    await expect(getReportedVoiceAudio("report-1", "msg-1")).rejects.toThrow(/unsupported audio/i);
  });

  it("refuses another voice note by the same sender (not the exact reported one)", async () => {
    (mockPrisma.report.findUnique as any).mockResolvedValue({ conversationId: "conv-1", reportedMessageId: "msg-1" });
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
    (mockPrisma.message.findUnique as any).mockResolvedValue(encVoice(MP4, { conversationId: "other" }));
    await expect(getReportedVoiceAudio("report-1", "msg-1")).rejects.toThrow(/not found/i);
  });

  it("refuses a non-voice exact message", async () => {
    (mockPrisma.report.findUnique as any).mockResolvedValue({ conversationId: "conv-1", reportedMessageId: "msg-1" });
    (mockPrisma.message.findUnique as any).mockResolvedValue(encVoice(MP4, { messageType: "text" }));
    await expect(getReportedVoiceAudio("report-1", "msg-1")).rejects.toThrow(/not found/i);
  });

  it("uses a uniform not-found error (never reveals unrelated audio exists)", async () => {
    (mockPrisma.report.findUnique as any).mockResolvedValue(null);
    await expect(getReportedVoiceAudio("ghost", "msg-1")).rejects.toThrow(/not found/i);
  });
});
