import OpenAI from "openai";
import { createHash } from "node:crypto";
import { config } from "../config/index.js";

const STUB_KEY = "sk-stub-placeholder-key";
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMS = 1536;

/**
 * Generate a deterministic pseudo-random embedding from text hash.
 * Used in dev/test when no OpenAI API key is configured.
 * Produces a normalized 1536-dim vector seeded from SHA-256 hash.
 */
function getStubEmbedding(text: string): number[] {
  const hash = createHash("sha256").update(text).digest();
  const vector: number[] = [];

  for (let i = 0; i < EMBEDDING_DIMS; i++) {
    // Use hash bytes cyclically to seed values between -1 and 1
    const byte = hash[i % hash.length];
    const nextByte = hash[(i + 1) % hash.length];
    vector.push(((byte * 256 + nextByte) / 65535) * 2 - 1);
  }

  // Normalize to unit length
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return vector.map((v) => v / magnitude);
}

export async function generateEmbedding(text: string): Promise<number[]> {
  if (!config.OPENAI_API_KEY || config.OPENAI_API_KEY === STUB_KEY) {
    return getStubEmbedding(text);
  }

  const client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });

  return response.data[0].embedding;
}

export { EMBEDDING_DIMS };
