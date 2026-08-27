import { createRemoteJWKSet, jwtVerify } from "jose";
import { prisma } from "../lib/prisma.js";
import { config } from "../config/index.js";
import { complianceRevocationCascade } from "../compliance/compliance.service.js";

/**
 * Sign in with Apple server-to-server notifications (Apple TN3194). Apple POSTs
 * `{ payload: <signed JWT> }` when a user changes consent — most importantly
 * `consent-revoked` (the user chose "Stop Using Apple ID" outside Empath) and
 * `account-delete`. We verify the signature cryptographically, then invalidate
 * that account's sessions/sockets/matching so a revoked credential can't keep
 * renewing access.
 *
 * Security:
 *  - Never trust unverified `sub`/`events` — the JWT signature + iss/aud are
 *    checked first.
 *  - Never reveal whether an Apple sub maps to a user (neutral handling).
 *  - Never log the signed token, Apple identifiers, or secrets.
 *  - We do NOT auto-erase legally retained data here; we withdraw active access
 *    and clear the (now-dead) Apple refresh-token material. Full erasure remains
 *    the explicit in-app deletion flow.
 */

const APPLE_ISSUER = "https://appleid.apple.com";
const appleJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

// Apple event types that mean access must be withdrawn.
const REVOCATION_EVENTS = new Set(["consent-revoked", "account-delete"]);

export class AppleNotificationError extends Error {}

function clientId(): string {
  return config.APPLE_CLIENT_ID || config.APPLE_BUNDLE_ID;
}

interface AppleEvent {
  type: string;
  sub?: string;
}

/**
 * Verify and process one Apple server-to-server notification. Resolves quietly
 * for irrelevant events and unknown subs (idempotent, no existence disclosure).
 * Throws AppleNotificationError only when the payload is cryptographically
 * invalid or malformed (the caller maps that to 400 with no mutation).
 */
export async function handleAppleServerNotification(signedPayload: unknown): Promise<void> {
  if (typeof signedPayload !== "string" || signedPayload.length === 0) {
    throw new AppleNotificationError("missing payload");
  }

  let claims: Record<string, unknown>;
  try {
    const { payload } = await jwtVerify(signedPayload, appleJwks, {
      issuer: APPLE_ISSUER,
      audience: clientId(),
    });
    claims = payload as Record<string, unknown>;
  } catch {
    throw new AppleNotificationError("invalid signature");
  }

  // `events` is a JSON-encoded string inside the verified JWT.
  let event: AppleEvent;
  try {
    const raw = claims.events;
    event = typeof raw === "string" ? JSON.parse(raw) : (raw as AppleEvent);
  } catch {
    throw new AppleNotificationError("malformed events");
  }
  if (!event || typeof event.type !== "string") {
    throw new AppleNotificationError("malformed events");
  }

  if (!REVOCATION_EVENTS.has(event.type)) {
    return; // e.g. email-enabled/disabled — acknowledged, no action.
  }
  if (typeof event.sub !== "string" || event.sub.length === 0) {
    throw new AppleNotificationError("malformed events");
  }

  await revokeForAppleSub(event.sub);
}

async function revokeForAppleSub(sub: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { appleSub: sub },
    select: { id: true },
  });
  // Neutral for unknown subs — never disclose whether the account exists.
  if (!user) return;

  // Same revocation cascade as consent withdrawal / deletion: bump tokenVersion
  // (kills access + refresh), disconnect sockets, evict from matching, clear
  // compliance cache. Idempotent enough — re-running just re-invalidates.
  await complianceRevocationCascade(user.id);

  // The stored Apple refresh token is now dead — clear it.
  await prisma.user.update({
    where: { id: user.id },
    data: {
      appleRefreshTokenCipher: null,
      appleRefreshTokenIv: null,
      appleRefreshTokenAuthTag: null,
    },
  });
}
