import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z
    .string()
    .length(64)
    .regex(/^[0-9a-f]+$/i, "Must be a 64-char hex string (32 bytes)"),
  FRONTEND_URL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  OPENROUTER_MODEL: z.string().default("gpt-4o-mini"),
  ADMIN_SECRET: z.string().min(6).optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.format());
  process.exit(1);
}

// In production, OPENAI_API_KEY must be set — otherwise AI matching silently
// degrades to stub mode. In dev/test we fall back to a visible placeholder
// so unit tests can run without the secret.
if (parsed.data.NODE_ENV === "production" && !parsed.data.OPENAI_API_KEY) {
  console.error(
    "OPENAI_API_KEY is required in production. Set it or explicitly run with NODE_ENV=development for stub mode.",
  );
  process.exit(1);
}

// If the configured model is namespaced ("provider/model" like
// "google/gemini-2.0-flash-001"), the caller is routing through OpenRouter.
// Default OPENAI_BASE_URL to the OpenRouter endpoint so operators don't have
// to set two env vars in Railway — OPENAI_API_KEY alone is enough.
const looksLikeOpenRouterModel =
  parsed.data.OPENROUTER_MODEL && parsed.data.OPENROUTER_MODEL.includes("/");
const resolvedBaseUrl =
  parsed.data.OPENAI_BASE_URL ??
  (looksLikeOpenRouterModel ? "https://openrouter.ai/api/v1" : undefined);

export const config = {
  ...parsed.data,
  OPENAI_API_KEY: parsed.data.OPENAI_API_KEY ?? "sk-stub-placeholder-key",
  OPENAI_BASE_URL: resolvedBaseUrl,
};
