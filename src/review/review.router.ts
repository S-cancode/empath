import { Router } from "express";
import { authMiddleware, requireCompliance } from "../auth/auth.middleware.js";
import { isReviewer, ensureDemoConversation } from "./review.service.js";
import { NotFoundError } from "../shared/errors.js";

const router = Router();
router.use(authMiddleware, requireCompliance);

/**
 * Provision (idempotently) the reviewer's isolated scripted demo conversation.
 * Returns 404 for anyone who is not an allowlisted reviewer, so the path is
 * not discoverable and cannot be used as a backdoor.
 */
router.post("/demo-conversation", async (req, res, next) => {
  try {
    if (!(await isReviewer(req.user!.userId))) {
      throw new NotFoundError("Not found");
    }
    const result = await ensureDemoConversation(req.user!.userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export { router as reviewRouter };
