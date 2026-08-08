import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../auth/auth.middleware.js";
import { ValidationError } from "../shared/errors.js";
import { reportUser, blockUser, unblockUser } from "./safety.service.js";
import { prisma } from "../lib/prisma.js";

const router = Router();
router.use(authMiddleware);

const reportSchema = z.object({
  conversationId: z.string().uuid(),
  reportedUserId: z.string().uuid(),
  reason: z.enum(["harassment", "self_harm_encouragement", "sexual_content", "spam_scam", "medical_advice", "illegal_content", "underage_user", "other"]),
  details: z.string().max(500).optional(),
});

router.post("/report", async (req, res, next) => {
  try {
    const parsed = reportSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid report payload");
    }
    const { conversationId, reportedUserId, reason, details } = parsed.data;
    const result = await reportUser(
      req.user!.userId,
      conversationId,
      reportedUserId,
      reason,
      details,
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

const blockSchema = z.object({
  blockedUserId: z.string().uuid(),
});

router.post("/block", async (req, res, next) => {
  try {
    const parsed = blockSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid block payload");
    }
    await blockUser(req.user!.userId, parsed.data.blockedUserId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get("/blocked", async (req, res, next) => {
  try {
    const blocked = await prisma.blockedUser.findMany({
      where: { userId: req.user!.userId },
      include: { blockedUser: { select: { id: true, anonymousAlias: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(blocked.map((b) => ({
      id: b.id,
      userId: b.blockedUser.id,
      alias: b.blockedUser.anonymousAlias,
      blockedAt: b.createdAt,
    })));
  } catch (err) {
    next(err);
  }
});

router.delete("/block/:blockedUserId", async (req, res, next) => {
  try {
    await unblockUser(req.user!.userId, req.params.blockedUserId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export { router as safetyRouter };
