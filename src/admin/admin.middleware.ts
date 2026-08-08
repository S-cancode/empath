import type { Request, Response, NextFunction } from "express";
import { resolveModerator, type ModeratorSession } from "./moderator.service.js";
import { AuthError } from "../shared/errors.js";

declare global {
  namespace Express {
    interface Request {
      moderator?: ModeratorSession;
    }
  }
}

/**
 * Individual moderator authentication. Replaces the shared ADMIN_SECRET:
 * the actor is derived server-side from a short-lived session token, never
 * trusted from the client body.
 */
export async function moderatorAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;
  if (!token) {
    throw new AuthError("Moderator authentication required");
  }
  req.moderator = await resolveModerator(token);
  next();
}

/** Require an admin-role moderator (e.g. for creating other moderators). */
export function requireModeratorRole(role: "admin"): (req: Request, res: Response, next: NextFunction) => void {
  return (req, _res, next) => {
    if (req.moderator?.role !== role) {
      throw new AuthError("Insufficient moderator role");
    }
    next();
  };
}
