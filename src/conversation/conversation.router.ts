import { Router } from "express";
import { z } from "zod";
import {
  getConversationsForUser,
  getMessages,
  sendAsyncMessage,
  markRead,
  archiveConversation,
  getArchivedConversations,
  requestReconnect,
} from "./conversation.service.js";
import { authMiddleware, requireTier } from "../auth/auth.middleware.js";
import { apiLimiter } from "../shared/rate-limiter.js";
import { ValidationError } from "../shared/errors.js";
import { SubscriptionTier } from "../shared/types.js";

const router = Router();

router.use(authMiddleware);
router.use(apiLimiter);

router.get("/", async (req, res, next) => {
  try {
    const conversations = await getConversationsForUser(req.user!.userId);
    res.json(conversations);
  } catch (err) {
    next(err);
  }
});

router.get("/archived", async (req, res, next) => {
  try {
    const archived = await getArchivedConversations(req.user!.userId);
    res.json(archived);
  } catch (err) {
    next(err);
  }
});

router.get("/:id/messages", async (req, res, next) => {
  try {
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const messages = await getMessages(req.params.id, req.user!.userId, cursor, limit);
    res.json(messages);
  } catch (err) {
    next(err);
  }
});

const sendMessageSchema = z.object({
  content: z.string().min(1).max(5000),
});

router.post("/:id/messages", async (req, res, next) => {
  try {
    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("Message content is required (max 5000 chars)");
    }
    const message = await sendAsyncMessage(req.params.id, req.user!.userId, parsed.data.content);
    res.status(201).json({ id: message.id, sentAt: message.sentAt });
  } catch (err) {
    next(err);
  }
});

const readSchema = z.object({
  upToMessageId: z.string().uuid(),
});

router.put("/:id/messages/read", async (req, res, next) => {
  try {
    const parsed = readSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("upToMessageId is required");
    }
    await markRead(req.params.id, req.user!.userId, parsed.data.upToMessageId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.put("/:id/archive", async (req, res, next) => {
  try {
    await archiveConversation(req.params.id, req.user!.userId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Reconnect archived conversation (Premium+)
router.post("/:id/reconnect", requireTier(SubscriptionTier.PREMIUM), async (req, res, next) => {
  try {
    const result = await requestReconnect(req.params.id as string, req.user!.userId, req.user!.tier);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Voice notes — available to all tiers, handled primarily via Socket.IO
router.post("/:id/voice-note", async (_req, res) => {
  res.status(200).json({ message: "Use Socket.IO conversation:voice-note event for voice notes" });
});

// Stub: Post-session summary (Premium+)
router.get("/:id/summary", requireTier(SubscriptionTier.PREMIUM), async (_req, res) => {
  res.status(501).json({ error: "not_implemented", message: "Post-session summaries coming soon" });
});

export { router as conversationRouter };
