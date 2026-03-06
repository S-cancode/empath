import { Router } from "express";
import { categories } from "./categories.data.js";
import { optionalAuthMiddleware } from "../auth/auth.middleware.js";
import { getTierLimits } from "../config/tiers.js";
import { SubscriptionTier } from "../shared/types.js";

const router = Router();

router.get("/", optionalAuthMiddleware, (req, res) => {
  const tier = req.user?.tier ?? SubscriptionTier.FREE;
  const limits = getTierLimits(tier);

  const result = categories.map((cat) => ({
    ...cat,
    subTags: cat.subTags.map((tag) => ({
      ...tag,
      premiumOnly: tag.premiumOnly ?? false,
      available: limits.canUseSubTags || !tag.premiumOnly,
    })),
  }));

  res.json(result);
});

export { router as categoriesRouter };
