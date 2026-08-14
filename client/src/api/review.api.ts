import { apiClient } from "./client";

/** True only in a build compiled with EXPO_PUBLIC_REVIEW_MODE=true. */
export const isReviewBuild = process.env.EXPO_PUBLIC_REVIEW_MODE === "true";

/**
 * Redeem the App Review access code (from App Review notes) for the signed-in
 * reviewer. The code is sent over HTTPS and verified server-side; it is never
 * stored in the binary. Returns true on success. Throws on an invalid code so
 * the UI can show a message.
 */
export async function redeemReviewAccess(code: string): Promise<boolean> {
  const { data } = await apiClient.post<{ granted: boolean }>("/review/redeem", { code });
  return data.granted === true;
}

/**
 * Ask the server to provision (idempotently) the reviewer's scripted demo
 * conversation. Returns the conversation id, or null if this account has no
 * review grant yet (server responds 404). Only meaningful in a review build.
 */
export async function ensureReviewDemo(): Promise<string | null> {
  try {
    const { data } = await apiClient.post<{ conversationId: string }>("/review/demo-conversation");
    return data.conversationId ?? null;
  } catch {
    return null; // 404 until the code is redeemed, or offline — silently ignore
  }
}
