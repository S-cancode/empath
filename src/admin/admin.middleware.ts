import { timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { config } from "../config/index.js";
import { AuthError } from "../shared/errors.js";

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function adminAuth(req: Request, _res: Response, next: NextFunction): void {
  const secret = config.ADMIN_SECRET;
  if (!secret) {
    throw new AuthError("Admin access not configured");
  }

  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : (req.query.secret as string | undefined) ?? null;
  if (!token || !safeCompare(token, secret)) {
    throw new AuthError("Invalid admin credentials");
  }

  next();
}
