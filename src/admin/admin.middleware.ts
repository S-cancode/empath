import type { Request, Response, NextFunction } from "express";
import { config } from "../config/index.js";
import { AuthError } from "../shared/errors.js";

export function adminAuth(req: Request, _res: Response, next: NextFunction): void {
  const secret = config.ADMIN_SECRET;
  if (!secret) {
    throw new AuthError("Admin access not configured");
  }

  const headerToken = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;
  const queryToken = req.query.token as string | undefined;

  const token = headerToken ?? queryToken;
  if (!token || token !== secret) {
    throw new AuthError("Invalid admin credentials");
  }

  next();
}
