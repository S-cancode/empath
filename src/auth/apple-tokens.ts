import { SignJWT, importPKCS8 } from "jose";
import { config } from "../config/index.js";
import { encrypt, decrypt } from "../lib/crypto.js";

/**
 * Sign in with Apple server-to-server token lifecycle (Apple TN3194).
 *
 * On sign-in we exchange the one-time authorization code for an Apple refresh
 * token and store it encrypted at rest. On account deletion we use it to revoke
 * Apple's tokens, so "Sign in with Apple" access is actually withdrawn — not
 * just forgotten locally.
 *
 * Secrets (team id, key id, .p8 private key) live only in server env. Tokens
 * and codes are NEVER logged or returned to a client.
 */

const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
const APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke";
const APPLE_AUD = "https://appleid.apple.com";

export function isAppleServerConfigured(): boolean {
  return Boolean(
    config.APPLE_TEAM_ID && config.APPLE_KEY_ID && config.APPLE_PRIVATE_KEY,
  );
}

function clientId(): string {
  return config.APPLE_CLIENT_ID || config.APPLE_BUNDLE_ID;
}

/** Generate the short-lived ES256 client secret Apple's endpoints require. */
async function generateClientSecret(): Promise<string> {
  const pem = (config.APPLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  const key = await importPKCS8(pem, "ES256");
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: config.APPLE_KEY_ID })
    .setIssuer(config.APPLE_TEAM_ID as string)
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .setAudience(APPLE_AUD)
    .setSubject(clientId())
    .sign(key);
}

/**
 * Exchange an authorization code for Apple tokens. Returns the refresh token,
 * or null if the server is unconfigured or Apple returns none. Throws on an
 * HTTP/parse error so the caller can decide (sign-in treats it as best-effort).
 */
export async function exchangeAuthorizationCode(code: string): Promise<string | null> {
  if (!isAppleServerConfigured()) return null;
  const clientSecret = await generateClientSecret();
  const body = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
  });
  const res = await fetch(APPLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`apple token exchange failed: ${res.status}`);
  }
  const json = (await res.json()) as { refresh_token?: unknown };
  return typeof json.refresh_token === "string" && json.refresh_token.length > 0
    ? json.refresh_token
    : null;
}

/** Revoke an Apple refresh token. Throws on any non-2xx / transport error. */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  if (!isAppleServerConfigured()) {
    throw new Error("apple server credentials not configured");
  }
  const clientSecret = await generateClientSecret();
  const body = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret,
    token: refreshToken,
    token_type_hint: "refresh_token",
  });
  const res = await fetch(APPLE_REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`apple revoke failed: ${res.status}`);
  }
}

export interface AppleTokenColumns {
  appleRefreshTokenCipher: string | null;
  appleRefreshTokenIv: string | null;
  appleRefreshTokenAuthTag: string | null;
}

/** Encrypt an Apple refresh token into the three column values for User. */
export function encryptAppleRefreshToken(token: string): AppleTokenColumns {
  const e = encrypt(token);
  return {
    appleRefreshTokenCipher: e.ciphertext,
    appleRefreshTokenIv: e.iv,
    appleRefreshTokenAuthTag: e.authTag,
  };
}

/** Decrypt a stored Apple refresh token, or null if none/legacy. */
export function decryptAppleRefreshToken(user: Partial<AppleTokenColumns>): string | null {
  if (
    !user.appleRefreshTokenCipher ||
    !user.appleRefreshTokenIv ||
    !user.appleRefreshTokenAuthTag
  ) {
    return null;
  }
  return decrypt({
    ciphertext: user.appleRefreshTokenCipher,
    iv: user.appleRefreshTokenIv,
    authTag: user.appleRefreshTokenAuthTag,
  });
}
