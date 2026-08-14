import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../auth/auth.middleware.js";
import { prisma } from "../lib/prisma.js";
import { ValidationError, ForbiddenError } from "../shared/errors.js";
import { SUPPORTED_LANGUAGES } from "../translate/translate.service.js";
import { hasTranslationConsent } from "../compliance/compliance.service.js";

const router = Router();
router.use(authMiddleware);

const translationSchema = z.object({
  preferredLanguage: z
    .string()
    .refine((v) => (SUPPORTED_LANGUAGES as readonly string[]).includes(v), {
      message: `preferredLanguage must be one of: ${SUPPORTED_LANGUAGES.join(", ")}`,
    })
    .optional()
    .nullable(),
  preferredDialect: z.string().max(20).optional().nullable(),
  autoTranslateEnabled: z.boolean().optional(),
});

// Runtime, user-changeable country for crisis-resource routing. ISO-3166
// alpha-2 (or null → international fallback). No membership/PII beyond a code.
const crisisCountrySchema = z.object({
  crisisCountry: z.string().length(2).toUpperCase().nullable(),
});

router.get("/crisis-country", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { crisisCountry: true },
    });
    res.json({ crisisCountry: user?.crisisCountry ?? null });
  } catch (err) {
    next(err);
  }
});

router.put("/crisis-country", async (req, res, next) => {
  try {
    const parsed = crisisCountrySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("crisisCountry must be a 2-letter country code or null");
    }
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { crisisCountry: parsed.data.crisisCountry },
      select: { crisisCountry: true },
    });
    res.json({ crisisCountry: user.crisisCountry });
  } catch (err) {
    next(err);
  }
});

router.get("/translation", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        preferredLanguage: true,
        preferredDialect: true,
        autoTranslateEnabled: true,
        languageDetectedAt: true,
      },
    });
    res.json({
      preferredLanguage: user?.preferredLanguage ?? null,
      preferredDialect: user?.preferredDialect ?? null,
      autoTranslateEnabled: user?.autoTranslateEnabled ?? false,
      languageDetectedAt: user?.languageDetectedAt ?? null,
      supportedLanguages: SUPPORTED_LANGUAGES,
    });
  } catch (err) {
    next(err);
  }
});

router.put("/translation", async (req, res, next) => {
  try {
    const parsed = translationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((i) => i.message).join("; "),
      );
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.preferredLanguage !== undefined) {
      data.preferredLanguage = parsed.data.preferredLanguage;
      data.languageDetectedAt = parsed.data.preferredLanguage ? new Date() : null;
    }
    if (parsed.data.preferredDialect !== undefined) {
      data.preferredDialect = parsed.data.preferredDialect;
    }
    if (parsed.data.autoTranslateEnabled !== undefined) {
      // Enabling sends message content to the AI provider — require a
      // server-recorded, unwithdrawn translation consent. Client-side logging
      // alone is not sufficient.
      if (parsed.data.autoTranslateEnabled === true) {
        const consented = await hasTranslationConsent(req.user!.userId);
        if (!consented) {
          throw new ForbiddenError(
            "Recorded translation consent is required before enabling auto-translate.",
          );
        }
      }
      data.autoTranslateEnabled = parsed.data.autoTranslateEnabled;
    }

    if (Object.keys(data).length === 0) {
      throw new ValidationError("At least one field required");
    }

    const updated = await prisma.user.update({
      where: { id: req.user!.userId },
      data,
      select: {
        preferredLanguage: true,
        preferredDialect: true,
        autoTranslateEnabled: true,
        languageDetectedAt: true,
      },
    });

    res.json({
      preferredLanguage: updated.preferredLanguage,
      preferredDialect: updated.preferredDialect,
      autoTranslateEnabled: updated.autoTranslateEnabled,
      languageDetectedAt: updated.languageDetectedAt,
    });
  } catch (err) {
    next(err);
  }
});

export { router as settingsRouter };
