import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression test for the security review's P1: real-time live-session text
// must go through pre-delivery moderation (fail-closed), like async chat.

vi.mock("../config/index.js", () => ({
  config: {
    JWT_SECRET: "test-jwt-secret-at-least-32-characters-long",
    JWT_REFRESH_SECRET: "test-refresh-secret-at-least-32-characters",
    ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    NODE_ENV: "test",
  },
}));
vi.mock("../lib/prisma.js", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock("../lib/redis.js", () => ({ redis: { get: vi.fn(), set: vi.fn() } }));
vi.mock("../auth/auth.service.js", () => ({ verifyAccessToken: vi.fn() }));

const mockBuffer = vi.fn();
vi.mock("./chat.service.js", () => ({
  bufferMessage: (...a: unknown[]) => mockBuffer(...a),
  endLiveSession: vi.fn(),
  extendLiveSession: vi.fn(),
  startLiveSession: vi.fn(),
}));
vi.mock("../conversation/conversation.service.js", () => ({
  sendAsyncMessage: vi.fn(),
  sendVoiceNote: vi.fn(),
  markDelivered: vi.fn(),
  markRead: vi.fn(),
}));
vi.mock("../presence/presence.service.js", () => ({
  setOnline: vi.fn(),
  setOffline: vi.fn(),
  isOnline: vi.fn().mockResolvedValue(false),
  getPartnerIdsForUser: vi.fn().mockResolvedValue([]),
}));
vi.mock("../notifications/notification.service.js", () => ({
  emitNotification: vi.fn(),
  notificationBus: { on: vi.fn() },
}));
vi.mock("../notifications/push.service.js", () => ({ setActiveConversation: vi.fn() }));
vi.mock("../matching/matching.service.js", () => ({ acceptProposal: vi.fn(), declineProposal: vi.fn() }));
vi.mock("../translate/translate.service.js", () => ({ translateText: vi.fn(), isSupportedLanguage: vi.fn() }));

const mockAssertLive = vi.fn();
vi.mock("./authz.js", () => ({
  assertConversationParticipant: vi.fn(),
  assertActiveConversationParticipant: vi.fn(),
  assertLiveSessionParticipant: (...a: unknown[]) => mockAssertLive(...a),
}));

const mockModerate = vi.fn();
vi.mock("../safety/content-moderation.service.js", () => ({
  moderateText: (...a: unknown[]) => mockModerate(...a),
}));

const mockCompliant = vi.fn();
vi.mock("../compliance/compliance-gate.service.js", () => ({
  checkUserCompliance: vi.fn(),
  checkUserComplianceCached: (...a: unknown[]) => mockCompliant(...a),
}));

import { setupChatGateway } from "./chat.gateway.js";

/** Register the gateway, run the connection handler, return the socket's on-map. */
async function connectSocket(userId: string) {
  const io: any = { use: vi.fn(), on: vi.fn() };
  setupChatGateway(io);
  const connectionHandler = io.on.mock.calls.find((c: any[]) => c[0] === "connection")[1];

  const handlers = new Map<string, (...a: any[]) => any>();
  const socket: any = {
    data: { userId },
    handshake: { auth: {} },
    join: vi.fn(),
    emit: vi.fn(),
    to: vi.fn(() => ({ emit: vi.fn() })),
    on: (event: string, fn: (...a: any[]) => any) => handlers.set(event, fn),
    onAny: vi.fn(),
  };
  await connectionHandler(socket);
  return { socket, handlers };
}

describe("live-session message pre-delivery moderation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCompliant.mockResolvedValue({ ok: true });
    mockAssertLive.mockResolvedValue({ conversationId: "conv-1" });
  });

  it("does NOT buffer or emit a message that moderation blocks", async () => {
    mockModerate.mockResolvedValue({ action: "block", allowed: false, categories: ["harassment"] });
    const { socket, handlers } = await connectSocket("user-1");
    const emitToRoom = vi.fn();
    socket.to.mockReturnValue({ emit: emitToRoom });

    await handlers.get("livesession:message")!({
      liveSessionId: "ls-1",
      conversationId: "conv-1",
      content: "you are worthless garbage",
    });

    expect(mockModerate).toHaveBeenCalledWith("you are worthless garbage");
    expect(mockBuffer).not.toHaveBeenCalled();
    expect(emitToRoom).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith("error", expect.objectContaining({ message: expect.any(String) }));
  });

  it("fails closed: a quarantine (provider unavailable) is also not delivered", async () => {
    mockModerate.mockResolvedValue({ action: "quarantine", allowed: false, categories: [] });
    const { socket, handlers } = await connectSocket("user-1");
    const emitToRoom = vi.fn();
    socket.to.mockReturnValue({ emit: emitToRoom });

    await handlers.get("livesession:message")!({
      liveSessionId: "ls-1",
      conversationId: "conv-1",
      content: "hello there",
    });

    expect(mockBuffer).not.toHaveBeenCalled();
    expect(emitToRoom).not.toHaveBeenCalled();
  });

  it("delivers a message that moderation allows", async () => {
    mockModerate.mockResolvedValue({ action: "allow", allowed: true, categories: [] });
    const { socket, handlers } = await connectSocket("user-1");
    const emitToRoom = vi.fn();
    socket.to.mockReturnValue({ emit: emitToRoom });

    await handlers.get("livesession:message")!({
      liveSessionId: "ls-1",
      conversationId: "conv-1",
      content: "how are you doing today",
    });

    expect(mockBuffer).toHaveBeenCalledWith("conv-1", "user-1", "how are you doing today", "ls-1");
    expect(emitToRoom).toHaveBeenCalled();
  });
});
