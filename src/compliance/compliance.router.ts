import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../auth/auth.middleware.js";
import { ValidationError } from "../shared/errors.js";
import {
  confirmAge,
  acceptTerms,
  recordConsent,
  withdrawConsent,
  deleteAccount,
  submitComplaint,
  getComplaintsForUser,
} from "./compliance.service.js";

const router = Router();
router.use(authMiddleware);

const ageSchema = z.object({
  dateOfBirth: z.string().min(1),
});

router.post("/age-confirm", async (req, res, next) => {
  try {
    const parsed = ageSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid date of birth");
    }
    const result = await confirmAge(req.user!.userId, parsed.data.dateOfBirth);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const termsSchema = z.object({
  termsVersion: z.string().min(1),
  appVersion: z.string().optional(),
});

router.post("/terms/accept", async (req, res, next) => {
  try {
    const parsed = termsSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid terms payload");
    }
    const ip = req.ip;
    const result = await acceptTerms(
      req.user!.userId,
      parsed.data.termsVersion,
      ip,
      parsed.data.appVersion,
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

const consentSchema = z.object({
  consentType: z.string().min(1),
  version: z.string().min(1),
  granted: z.boolean(),
  textHash: z.string().min(1),
  appVersion: z.string().optional(),
  deviceType: z.string().optional(),
});

router.post("/consent", async (req, res, next) => {
  try {
    const parsed = consentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid consent payload");
    }
    const result = await recordConsent(req.user!.userId, {
      ...parsed.data,
      ip: req.ip,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/consent/withdraw", async (req, res, next) => {
  try {
    await withdrawConsent(req.user!.userId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- Complaints ---

const complaintSchema = z.object({
  subject: z.enum(["moderation_decision", "report_handling", "account_issue", "other"]),
  description: z.string().min(1).max(2000),
});

router.post("/complaints", async (req, res, next) => {
  try {
    const parsed = complaintSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid complaint payload");
    }
    const result = await submitComplaint(
      req.user!.userId,
      parsed.data.subject,
      parsed.data.description,
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/complaints", async (req, res, next) => {
  try {
    const complaints = await getComplaintsForUser(req.user!.userId);
    res.json(complaints);
  } catch (err) {
    next(err);
  }
});

router.delete("/account", async (req, res, next) => {
  try {
    await deleteAccount(req.user!.userId);
    res.json({ ok: true, message: "Account deleted" });
  } catch (err) {
    next(err);
  }
});

export { router as complianceRouter };
