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
  // Comma-separated Expo push tokens for founder escalation alerts
  FOUNDER_PUSH_TOKENS: z.string().optional(),
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

// ── AI processor guard (fail closed) ─────────────────────────────────────
// User content may only be sent to processors with a signed DPA. OpenAI's API
// is currently the only approved processor. A namespaced OPENROUTER_MODEL
// ("provider/model") or a custom OPENAI_BASE_URL used to silently reroute all
// AI traffic to OpenRouter — a processor we have no DPA, no transfer risk
// assessment, and no privacy-notice entry for. Both now refuse to boot.
// To approve a new processor: signed DPA + TRA + Processor Register entry
// first, then add its base URL to APPROVED_AI_BASE_URLS.
const APPROVED_AI_BASE_URLS = new Set(["https://api.openai.com/v1"]);

if (parsed.data.OPENROUTER_MODEL.includes("/")) {
  console.error(
    `OPENROUTER_MODEL="${parsed.data.OPENROUTER_MODEL}" is a namespaced (OpenRouter) model. ` +
      "OpenRouter is not an approved data processor (no signed DPA). " +
      "Use a bare OpenAI model name such as gpt-4o-mini.",
  );
  process.exit(1);
}

if (
  parsed.data.OPENAI_BASE_URL &&
  !APPROVED_AI_BASE_URLS.has(parsed.data.OPENAI_BASE_URL.replace(/\/+$/, ""))
) {
  console.error(
    `OPENAI_BASE_URL="${parsed.data.OPENAI_BASE_URL}" is not an approved AI processor endpoint. ` +
      `Approved endpoints: ${[...APPROVED_AI_BASE_URLS].join(", ")}`,
  );
  process.exit(1);
}

const STUB_AI_KEY = "sk-stub-placeholder-key";

export const config = {
  ...parsed.data,
  OPENAI_API_KEY: parsed.data.OPENAI_API_KEY ?? STUB_AI_KEY,
  OPENAI_BASE_URL: parsed.data.OPENAI_BASE_URL,
};

// Startup visibility: always log where AI traffic is going, so a config
// mistake is caught by reading the boot log rather than a data audit.
console.log(
  `[ai] endpoint: ${config.OPENAI_BASE_URL ?? "https://api.openai.com/v1 (SDK default)"} | ` +
    `chat model: ${config.OPENROUTER_MODEL} | ` +
    `mode: ${config.OPENAI_API_KEY === STUB_AI_KEY ? "STUB — no API key, nothing leaves this server" : "live"}`,
);
