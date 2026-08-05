import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---------------------------------------------------------------
// Default: stub mode (no API key). Individual describes override config below.

vi.mock("../config/index.js", () => ({
  config: {
    OPENAI_API_KEY: "sk-stub-placeholder-key",
    OPENAI_BASE_URL: undefined,
    OPENROUTER_MODEL: "google/gemini-2.0-flash-001",
    NODE_ENV: "test",
    // Cache entries are AES-encrypted at rest
    ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  },
}));

const redisStrings = new Map<string, string>();

vi.mock("../lib/redis.js", () => ({
  redis: {
    get: vi.fn(async (key: string) => redisStrings.get(key) ?? null),
    set: vi.fn(async (key: string, value: string, _ex?: string, _ttl?: number, nx?: string) => {
      if (nx === "NX" && redisStrings.has(key)) return null;
      redisStrings.set(key, value);
      return "OK";
    }),
    del: vi.fn(async (key: string) => {
      redisStrings.delete(key);
      return 1;
    }),
  },
}));

const { mockPrismaUser } = vi.hoisted(() => ({
  mockPrismaUser: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: mockPrismaUser,
  },
}));

// OpenAI mock. Shared mutable state is lifted via vi.hoisted so the factory
// (which vi.mock hoists to the top of the module) can close over it safely.
const openAiState = vi.hoisted(() => ({
  calls: [] as Array<{ apiKey?: string; baseURL?: string; body?: any }>,
  nextResponse: null as any,
  nextError: null as Error | null,
}));

vi.mock("openai", () => {
  class FakeOpenAI {
    apiKey: string;
    baseURL?: string;
    chat: { completions: { create: (body: any) => Promise<any> } };
    constructor(opts: { apiKey: string; baseURL?: string }) {
      this.apiKey = opts.apiKey;
      this.baseURL = opts.baseURL;
      this.chat = {
        completions: {
          create: async (body: any) => {
            openAiState.calls.push({ apiKey: this.apiKey, baseURL: this.baseURL, body });
            if (openAiState.nextError) throw openAiState.nextError;
            return openAiState.nextResponse;
          },
        },
      };
    }
  }
  return { default: FakeOpenAI };
});

// Import after mocks so the mocked module graph is in effect.
import { config } from "../config/index.js";
import {
  detectLanguageHeuristic,
  translateText,
  translateBatch,
  isSupportedLanguage,
  SUPPORTED_LANGUAGES,
} from "./translate.service.js";

function setApiKey(key: string, baseUrl?: string) {
  (config as any).OPENAI_API_KEY = key;
  (config as any).OPENAI_BASE_URL = baseUrl;
}

function resetOpenAiMock() {
  openAiState.calls.length = 0;
  openAiState.nextResponse = null;
  openAiState.nextError = null;
}
const openAiCalls = openAiState.calls;
function setNextResponse(r: any) { openAiState.nextResponse = r; }
function setNextError(e: Error | null) { openAiState.nextError = e; }

// --- Heuristic & supported-language tests --------------------------------

describe("detectLanguageHeuristic", () => {
  it("detects Japanese via hiragana/katakana", () => {
    expect(detectLanguageHeuristic("こんにちは、元気ですか？")).toBe("ja");
  });
  it("detects Korean via hangul", () => {
    expect(detectLanguageHeuristic("안녕하세요 반갑습니다")).toBe("ko");
  });
  it("detects Chinese via Han without kana", () => {
    expect(detectLanguageHeuristic("你好，我很高兴认识你")).toBe("zh");
  });
  it("detects Arabic", () => {
    expect(detectLanguageHeuristic("مرحبا كيف حالك")).toBe("ar");
  });
  it("detects Hindi (Devanagari)", () => {
    expect(detectLanguageHeuristic("नमस्ते आप कैसे हैं")).toBe("hi");
  });
  it("detects Russian (Cyrillic)", () => {
    expect(detectLanguageHeuristic("Здравствуйте, как дела")).toBe("ru");
  });
  it("falls back to English for Latin script", () => {
    expect(detectLanguageHeuristic("Hola, ¿cómo estás?")).toBe("en");
  });
  it("returns und for empty/symbolic input", () => {
    expect(detectLanguageHeuristic("!!! 123 ???")).toBe("und");
  });
});

describe("isSupportedLanguage", () => {
  it("accepts known codes", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(isSupportedLanguage(lang)).toBe(true);
    }
  });
  it("rejects unknown codes", () => {
    expect(isSupportedLanguage("xx")).toBe(false);
    expect(isSupportedLanguage("")).toBe(false);
  });
});

// --- Stub-mode translateText --------------------------------------------

describe("translateText (stub mode)", () => {
  beforeEach(() => {
    redisStrings.clear();
    setApiKey("sk-stub-placeholder-key", undefined);
    resetOpenAiMock();
  });

  it("returns text unchanged with detected source when target matches", async () => {
    const r = await translateText("Hello there", "en");
    expect(r.sourceLang).toBe("en");
    expect(r.translated).toBe("Hello there");
  });

  it("tags translated output in stub mode when target differs", async () => {
    const r = await translateText("こんにちは", "en");
    expect(r.sourceLang).toBe("ja");
    expect(r.translated).toBe("[en] こんにちは");
  });

  it("short-circuits when knownSourceLang equals target", async () => {
    const r = await translateText("any text", "es", { knownSourceLang: "es" });
    expect(r.sourceLang).toBe("es");
    expect(r.translated).toBe("any text");
  });

  it("returns input unchanged for unsupported target languages", async () => {
    const r = await translateText("Hello", "xx");
    expect(r.translated).toBe("Hello");
    expect(r.sourceLang).toBe("und");
  });

  it("returns empty text unchanged", async () => {
    const r = await translateText("", "en");
    expect(r.translated).toBe("");
  });

  it("caches results across calls", async () => {
    const first = await translateText("Ciao", "ja");
    expect(first.fromCache).toBeUndefined();
    const second = await translateText("Ciao", "ja");
    expect(second.fromCache).toBe(true);
    expect(second.translated).toBe(first.translated);
  });

  it("does not call OpenAI in stub mode", async () => {
    await translateText("Hola", "en");
    expect(openAiCalls).toHaveLength(0);
  });
});

describe("translateBatch (stub mode)", () => {
  beforeEach(() => {
    redisStrings.clear();
    setApiKey("sk-stub-placeholder-key", undefined);
    resetOpenAiMock();
  });

  it("translates multiple items in parallel and preserves ids", async () => {
    const results = await translateBatch(
      [
        { id: "m1", text: "Hello", sourceLang: "en" },
        { id: "m2", text: "Bonjour", sourceLang: "fr" },
      ],
      "es",
    );
    expect(results.size).toBe(2);
    expect(results.get("m1")?.translated).toBe("[es] Hello");
    expect(results.get("m2")?.translated).toBe("[es] Bonjour");
  });

  it("skips translation when source matches target", async () => {
    const results = await translateBatch(
      [{ id: "m1", text: "Hola", sourceLang: "es" }],
      "es",
    );
    expect(results.get("m1")?.translated).toBe("Hola");
  });
});

// --- OpenRouter/OpenAI-mode translateText --------------------------------

describe("translateText (OpenRouter mode)", () => {
  beforeEach(() => {
    redisStrings.clear();
    setApiKey("sk-or-v1-test-key", "https://openrouter.ai/api/v1");
    resetOpenAiMock();
  });

  it("uses the configured model and baseURL", async () => {
    openAiState.nextResponse = {
      choices: [
        { message: { content: JSON.stringify({ source_lang: "fr", translated: "Hello" }) } },
      ],
    };
    const r = await translateText("Bonjour", "en");
    expect(r.translated).toBe("Hello");
    expect(r.sourceLang).toBe("fr");
    expect(openAiCalls).toHaveLength(1);
    expect(openAiCalls[0].baseURL).toBe("https://openrouter.ai/api/v1");
    expect(openAiCalls[0].apiKey).toBe("sk-or-v1-test-key");
    expect(openAiCalls[0].body.model).toBe("google/gemini-2.0-flash-001");
  });

  it("falls open to original text on malformed JSON", async () => {
    openAiState.nextResponse = {
      choices: [{ message: { content: "not json at all" } }],
    };
    const r = await translateText("Bonjour", "en");
    expect(r.translated).toBe("Bonjour");
  });

  it("falls open to original text when the client throws", async () => {
    openAiState.nextError = new Error("network down");
    const r = await translateText("Bonjour", "en");
    expect(r.translated).toBe("Bonjour");
  });

  it("returns cached result on second call without hitting OpenAI", async () => {
    openAiState.nextResponse = {
      choices: [
        { message: { content: JSON.stringify({ source_lang: "fr", translated: "Hello" }) } },
      ],
    };
    await translateText("Bonjour", "en");
    expect(openAiCalls).toHaveLength(1);
    const second = await translateText("Bonjour", "en");
    expect(second.fromCache).toBe(true);
    expect(openAiCalls).toHaveLength(1); // no second call
  });
});

