import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../auth/auth.middleware.js";
import { ValidationError } from "../shared/errors.js";

const router = Router();

const pushTokenSchema = z.object({
  pushToken: z.string().regex(/^ExponentPushToken\[.+\]$/, "Invalid Expo push token format"),
});

router.post("/push-token", authMiddleware, async (req, res, next) => {
  try {
    const result = pushTokenSchema.safeParse(req.body);
    if (!result.success) {
      throw new ValidationError("Invalid Expo push token format");
    }

    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { pushToken: result.data.pushToken },
    });

    console.log(`[push] Token registered for user ${req.user!.userId}: ${result.data.pushToken.slice(0, 25)}...`);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export { router as pushTokenRouter };
