import { Router } from "express";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { adminAuth } from "./admin.middleware.js";
import { getReports, getReportDetail, takeAction, getDashboardStats } from "./admin.service.js";
import type { Request, Response } from "express";

export const adminRouter = Router();

adminRouter.use(adminAuth);

// Serve dashboard HTML
adminRouter.get("/", (_req: Request, res: Response) => {
  const html = readFileSync(join(__dirname, "dashboard.html"), "utf-8");
  res.type("html").send(html);
});

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
adminRouter.post("/reports/:id/action", async (req: Request, res: Response) => {
  const { action, reason, duration, moderatorId, severity } = req.body;
  const result = await takeAction(req.params.id as string, moderatorId || "admin", { action, severity, reason, duration });
  res.json(result);
});

// Dashboard stats
adminRouter.get("/stats", async (_req: Request, res: Response) => {
  const stats = await getDashboardStats();
  res.json(stats);
});
