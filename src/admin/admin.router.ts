import { Router } from "express";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { moderatorAuth } from "./admin.middleware.js";
import { moderatorLogin, auditModeratorAction } from "./moderator.service.js";
import { getReports, getReportDetail, takeAction, resolveEscalation, getDashboardStats, getReportedVoiceAudio } from "./admin.service.js";
import { redis } from "../lib/redis.js";
import { authLimiter } from "../shared/rate-limiter.js";
import { ValidationError } from "../shared/errors.js";
import type { Request, Response, NextFunction } from "express";

// Actor is derived server-side from the session — never trusted from the body.
const takeActionSchema = z.object({
  action: z.enum(["dismiss", "warn", "suspend", "ban", "escalate"]),
  reason: z.string().max(1000).optional(),
  severity: z.enum(["low", "medium", "high"]).optional(),
  duration: z.number().int().positive().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totp: z.string().min(6).max(8),
});

export const adminRouter = Router();

// The dashboard HTML shell is public: it contains no data. Data endpoints
// below require an individual moderator session (email+password+TOTP login).
adminRouter.get("/", (_req: Request, res: Response) => {
  const html = readFileSync(join(__dirname, "dashboard.html"), "utf-8");
  res.type("html").send(html);
});

adminRouter.post("/login", authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Invalid login payload");
    const ip = req.ip;
    const result = await moderatorLogin(parsed.data.email, parsed.data.password, parsed.data.totp, ip);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

adminRouter.use(moderatorAuth);

// List reports
adminRouter.get("/reports", async (req: Request, res: Response) => {
  const status = (req.query.status as string | undefined) || undefined;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

  const result = await getReports(status, page, limit);
  res.json(result);
});

// Report detail
adminRouter.get("/reports/:id", async (req: Request, res: Response) => {
  const result = await getReportDetail(req.params.id as string);
  await auditModeratorAction(req.moderator!.moderatorId, "view_report", {
    targetType: "report",
    targetId: req.params.id as string,
    ip: req.ip,
  });
  res.json(result);
});

// Take action on report
adminRouter.post("/reports/:id/action", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = takeActionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0].message);
    }
    const { action, reason, duration, severity } = parsed.data;
    const moderatorId = req.moderator!.moderatorId;
    const result = await takeAction(req.params.id as string, moderatorId, { action, severity, reason, duration });
    await auditModeratorAction(moderatorId, "take_action", {
      targetType: "report",
      targetId: req.params.id as string,
      detail: action,
      ip: req.ip,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const resolveEscalationSchema = z.object({
  outcome: z.string().min(1).max(1000),
  liftSuspension: z.boolean().optional().default(false),
  // Release the safeguarding retention hold early (otherwise it auto-expires).
  clearRetentionHold: z.boolean().optional().default(false),
});

// Resolve an escalated report (founder review outcome)
adminRouter.post("/reports/:id/escalation/resolve", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = resolveEscalationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0].message);
    }
    const { outcome, liftSuspension, clearRetentionHold } = parsed.data;
    const moderatorId = req.moderator!.moderatorId;
    const result = await resolveEscalation(req.params.id as string, moderatorId, outcome, liftSuspension, clearRetentionHold);
    await auditModeratorAction(moderatorId, "resolve_escalation", {
      targetType: "report",
      targetId: req.params.id as string,
      ip: req.ip,
      detail: clearRetentionHold ? "cleared_retention_hold" : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Secure moderator playback of a reported voice note. Audio is decrypted on
// demand, never cached, never in list JSON, and the access is audited.
adminRouter.get("/reports/:id/voice/:messageId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, messageId } = req.params as { id: string; messageId: string };
    const { base64Audio, mimeType } = await getReportedVoiceAudio(id, messageId);
    await auditModeratorAction(req.moderator!.moderatorId, "play_reported_voice", {
      targetType: "message",
      targetId: messageId,
      detail: `report:${id}`,
      ip: req.ip,
    });
    res.setHeader("Cache-Control", "no-store");
    // Server-determined from the decrypted bytes (WAV fixture vs real M4A).
    res.setHeader("Content-Type", mimeType);
    res.send(Buffer.from(base64Audio, "base64"));
  } catch (err) {
    next(err);
  }
});

// Dashboard stats
adminRouter.get("/stats", async (_req: Request, res: Response) => {
  const stats = await getDashboardStats();
  res.json(stats);
});

// Clear recent-match blocks (for testing)
adminRouter.delete("/recent-matches", async (_req: Request, res: Response) => {
  const keys = await redis.keys("match:recent:*");
  if (keys.length > 0) {
    await redis.del(...keys);
  }
  res.json({ cleared: keys.length });
});
