import { Router } from "express";
import { authMiddleware, requireTier } from "../auth/auth.middleware.js";
import { apiLimiter } from "../shared/rate-limiter.js";
import { SubscriptionTier } from "../shared/types.js";

const router = Router();

router.use(authMiddleware);
router.use(apiLimiter);
router.use(requireTier(SubscriptionTier.PREMIUM));

router.get("/", (_req, res) => {
  res.status(501).json({ error: "not_implemented", message: "Journaling coming soon" });
});

router.post("/", (_req, res) => {
  res.status(501).json({ error: "not_implemented", message: "Journaling coming soon" });
});

export { router as journalingRouter };
