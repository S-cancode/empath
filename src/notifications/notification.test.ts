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

vi.mock("../lib/redis.js", () => ({
  redis: {
    publish: vi.fn(async () => 1),
  },
}));

import { emitNotification, notificationBus, type NotificationEvent } from "./notification.service.js";
import { redis } from "../lib/redis.js";

describe("notification.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationBus.removeAllListeners();
  });

  it("emits event on the bus", () => {
    const handler = vi.fn();
    notificationBus.on("notification", handler);

    const event: NotificationEvent = {
      type: "new_message",
      recipientId: "user-1",
      payload: { conversationId: "conv-1" },
      createdAt: new Date(),
    };

    emitNotification(event);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it("publishes to Redis", () => {
    const event: NotificationEvent = {
      type: "new_match",
      recipientId: "user-1",
      payload: { conversationId: "conv-1" },
      createdAt: new Date(),
    };

    emitNotification(event);
    expect(redis.publish).toHaveBeenCalledWith("notifications", expect.any(String));
  });

  it("supports multiple notification types", () => {
    const types: NotificationEvent["type"][] = [
      "new_message",
      "new_match",
      "match_online",
      "live_session_invite",
      "live_session_started",
      "live_session_ended",
      "message_delivered",
      "message_read",
    ];

    const handler = vi.fn();
    notificationBus.on("notification", handler);

    for (const type of types) {
      emitNotification({
        type,
        recipientId: "user-1",
        payload: {},
        createdAt: new Date(),
      });
    }

    expect(handler).toHaveBeenCalledTimes(types.length);
  });
});
