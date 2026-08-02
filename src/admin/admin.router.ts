import { Router } from "express";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { adminAuth } from "./admin.middleware.js";
import { getReports, getReportDetail, takeAction, resolveEscalation, getDashboardStats } from "./admin.service.js";
import { redis } from "../lib/redis.js";
import { ValidationError } from "../shared/errors.js";
import type { Request, Response, NextFunction } from "express";

const takeActionSchema = z.object({
  action: z.enum(["dismiss", "warn", "suspend", "ban", "escalate"]),
  reason: z.string().max(1000).optional(),
  moderatorId: z.string().min(1).optional(),
  severity: z.enum(["low", "medium", "high"]).optional(),
  duration: z.number().int().positive().optional(),
});

export const adminRouter = Router();

// The dashboard HTML shell is public: it contains no data, and a browser
// navigation cannot send the Authorization header. The page prompts for the
// admin secret and sends it as a Bearer token to the data endpoints below,
// which all sit behind adminAuth.
adminRouter.get("/", (_req: Request, res: Response) => {
  const html = readFileSync(join(__dirname, "dashboard.html"), "utf-8");
  res.type("html").send(html);
});

adminRouter.use(adminAuth);

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
  res.json(result);
});

// Take action on report
adminRouter.post("/reports/:id/action", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = takeActionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0].message);
    }
    const { action, reason, duration, moderatorId, severity } = parsed.data;
    const result = await takeAction(req.params.id as string, moderatorId || "admin", { action, severity, reason, duration });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const resolveEscalationSchema = z.object({
  outcome: z.string().min(1).max(1000),
  liftSuspension: z.boolean().optional().default(false),
  moderatorId: z.string().min(1).optional(),
});

// Resolve an escalated report (founder review outcome)
adminRouter.post("/reports/:id/escalation/resolve", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = resolveEscalationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0].message);
    }
    const { outcome, liftSuspension, moderatorId } = parsed.data;
    const result = await resolveEscalation(req.params.id as string, moderatorId || "admin", outcome, liftSuspension);
    res.json(result);
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
