import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/index.js", () => ({
  config: {
    JWT_SECRET: "test-jwt-secret-at-least-32-characters-long",
    JWT_REFRESH_SECRET: "test-refresh-secret-at-least-32-characters",
    ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    REDIS_URL: "redis://localhost:6379",
    PORT: 3000,
    NODE_ENV: "test",
  },
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("../lib/redis.js", () => ({
  redis: { get: vi.fn(), set: vi.fn() },
}));

vi.mock("../auth/auth.service.js", () => ({
  verifyAccessToken: vi.fn(),
}));

vi.mock("./chat.service.js", () => ({
  bufferMessage: vi.fn(),
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
  isOnline: vi.fn(),
  getPartnerIdsForUser: vi.fn(),
}));

vi.mock("../notifications/notification.service.js", () => ({
  emitNotification: vi.fn(),
  notificationBus: { on: vi.fn() },
}));

vi.mock("../notifications/push.service.js", () => ({
  setActiveConversation: vi.fn(),
}));

vi.mock("../matching/matching.service.js", () => ({
  acceptProposal: vi.fn(),
  declineProposal: vi.fn(),
}));

vi.mock("../translate/translate.service.js", () => ({
  translateText: vi.fn(),
  isSupportedLanguage: vi.fn(),
}));

import { setupChatGateway } from "./chat.gateway.js";
import { verifyAccessToken } from "../auth/auth.service.js";
import { prisma } from "../lib/prisma.js";

const mockVerify = vi.mocked(verifyAccessToken);
const mockFindUnique = vi.mocked(prisma.user.findUnique);

type SocketMiddleware = (socket: any, next: (err?: Error) => void) => Promise<void>;

function getHandshakeMiddleware(): SocketMiddleware {
  const io = { use: vi.fn(), on: vi.fn() };
  setupChatGateway(io as any);
  return io.use.mock.calls[0][0] as SocketMiddleware;
}

function makeSocket(token: string | undefined) {
  return { handshake: { auth: { token } }, data: {} };
}

describe("chat gateway handshake auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerify.mockReturnValue({ userId: "user-1", tier: "FREE" } as any);
  });

  it("rejects connection without a token", async () => {
    const middleware = getHandshakeMiddleware();
    const next = vi.fn();

    await middleware(makeSocket(undefined), next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0].message).toBe("Authentication required");
  });

  it("rejects connection with an invalid token", async () => {
    mockVerify.mockImplementation(() => {
      throw new Error("bad token");
    });
    const middleware = getHandshakeMiddleware();
    const next = vi.fn();

    await middleware(makeSocket("bad"), next);

    expect(next.mock.calls[0][0].message).toBe("Invalid token");
  });

  it("rejects a banned user even with a valid token", async () => {
    (mockFindUnique as any).mockResolvedValue({ banned: true, suspendedUntil: null });
    const middleware = getHandshakeMiddleware();
    const next = vi.fn();
    const socket = makeSocket("valid");

    await middleware(socket, next);

    expect(next.mock.calls[0][0].message).toBe("Your account has been permanently banned");
    expect(socket.data.userId).toBeUndefined();
  });

  it("rejects a currently-suspended user", async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    (mockFindUnique as any).mockResolvedValue({ banned: false, suspendedUntil: future });
    const middleware = getHandshakeMiddleware();
    const next = vi.fn();

    await middleware(makeSocket("valid"), next);

    expect(next.mock.calls[0][0].message).toContain("Your account is suspended until");
  });

  it("allows a user whose suspension has expired", async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    (mockFindUnique as any).mockResolvedValue({ banned: false, suspendedUntil: past });
    const middleware = getHandshakeMiddleware();
    const next = vi.fn();
    const socket = makeSocket("valid");

    await middleware(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.data.userId).toBe("user-1");
    expect(socket.data.tier).toBe("FREE");
  });

  it("allows a user in good standing", async () => {
    (mockFindUnique as any).mockResolvedValue({ banned: false, suspendedUntil: null });
    const middleware = getHandshakeMiddleware();
    const next = vi.fn();
    const socket = makeSocket("valid");

    await middleware(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.data.userId).toBe("user-1");
  });

  it("fails closed when the ban lookup errors", async () => {
    (mockFindUnique as any).mockRejectedValue(new Error("db down"));
    const middleware = getHandshakeMiddleware();
    const next = vi.fn();

    await middleware(makeSocket("valid"), next);

    expect(next.mock.calls[0][0].message).toBe("Authentication check failed");
  });
});
