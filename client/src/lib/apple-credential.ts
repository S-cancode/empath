/**
 * Defence-in-depth for Sign in with Apple credential revocation. If Apple
 * reports the credential is REVOKED or NOT_FOUND (e.g. the user chose "Stop
 * Using Apple ID" outside Empath), the client force-signs-out. This is NOT the
 * source of truth — the backend invalidates sessions via the Apple
 * server-to-server notification — it just avoids a stale local session lingering
 * until the next token refresh.
 *
 * Kept dependency-free (numeric mirror of AppleAuthenticationCredentialState:
 * REVOKED=0, AUTHORIZED=1, NOT_FOUND=2, TRANSFERRED=3) so it is unit-testable
 * without the native module.
 */
export const APPLE_USER_ID_KEY = "apple_user_id";

export const APPLE_CRED_REVOKED = 0;
export const APPLE_CRED_NOT_FOUND = 2;

export function shouldForceSignOut(state: number): boolean {
  return state === APPLE_CRED_REVOKED || state === APPLE_CRED_NOT_FOUND;
}
