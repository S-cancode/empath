import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => ({
        anonymousAlias: "QuietFox42",
        pushToken: "ExponentPushToken[abc123]",
      })),
    },
  },
}));

const redisStore = new Map<string, string>();
vi.mock("../lib/redis.js", () => ({
  redis: {
    get: vi.fn(async (k: string) => redisStore.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => { redisStore.set(k, v); }),
  },
}));

import { handlePushNotification } from "./push.service.js";

const SECRET = "i-am-going-through-a-really-hard-divorce-and-feel-suicidal";

describe("push notification payload safety", () => {
  let sent: any[];

  beforeEach(() => {
    sent = [];
    redisStore.clear();
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: any) => {
      sent.push(JSON.parse(init.body));
      return { json: async () => ({ data: { status: "ok" } }) } as any;
    }));
  });

  it("new_message push contains neutral copy and no message content, sender id, or alias", async () => {
    await handlePushNotification({
      type: "new_message",
      recipientId: "recipient-1",
      payload: {
        conversationId: "conv-1",
        senderId: "sender-secret-id",
        messageContent: SECRET,
        messageType: "text",
      },
      createdAt: new Date(),
    } as any);

    expect(sent).toHaveLength(1);
    const body = JSON.stringify(sent[0]);
    expect(body).not.toContain(SECRET);
    expect(body).not.toContain("sender-secret-id");
    expect(body).not.toContain("QuietFox42");
    expect(sent[0].title).toBe("Empath");
    expect(sent[0].body).toBe("You have a new message");
    // Only routing info in data.
    expect(sent[0].data).toMatchObject({ screen: "chat", conversationId: "conv-1" });
    expect(sent[0].data.messageContent).toBeUndefined();
  });

  it("match_proposed push carries no partner summary or category in its data", async () => {
    await handlePushNotification({
      type: "match_proposed",
      recipientId: "recipient-1",
      payload: {
        conversationId: "conv-1",
        partnerSummary: "struggling with grief after losing a parent",
        partnerCategory: "grief",
      },
      createdAt: new Date(),
    } as any);

    const body = JSON.stringify(sent[0]);
    expect(body).not.toContain("grief");
    expect(body).not.toContain("losing a parent");
  });
});
