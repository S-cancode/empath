import { apiClient } from "./client";

/**
 * Ask the server to provision (idempotently) the reviewer's scripted demo
 * conversation. Returns the conversation id, or null if this account is not an
 * allowlisted reviewer (server responds 404). Only called from a review build.
 */
export async function ensureReviewDemo(): Promise<string | null> {
  try {
    const { data } = await apiClient.post<{ conversationId: string }>("/review/demo-conversation");
    return data.conversationId ?? null;
  } catch {
    return null; // 404 for non-reviewers, or offline — silently ignore
  }
}
