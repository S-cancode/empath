import OpenAI from "openai";
import { createHash } from "node:crypto";
import { config } from "../config/index.js";

const STUB_KEY = "sk-stub-placeholder-key";
// text-embedding-3-large is meaningfully stronger than -small on mental-health
// semantics; we request it at 1536 dims so it still indexes under pgvector
// (HNSW/IVFFlat both cap at 2000). Represents a real quality upgrade with no
// schema change vs. the -small default.
const EMBEDDING_MODEL = "text-embedding-3-large";
const EMBEDDING_DIMS = 1536;

/**
 * Generate a deterministic pseudo-random embedding from text hash.
 * Used in dev/test when no OpenAI API key is configured.
 * Produces a normalized EMBEDDING_DIMS-long vector seeded from SHA-256 hash.
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

  const client = new OpenAI({
    apiKey: config.OPENAI_API_KEY,
    baseURL: config.OPENAI_BASE_URL,
  });
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMS,
  });

  return response.data[0].embedding;
}

export { EMBEDDING_DIMS };
