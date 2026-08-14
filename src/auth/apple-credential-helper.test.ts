// The client Apple credential-state gate is dependency-free, so vitest runs it
// from the client tree (same pattern as voice-send-helper.test.ts).
import { describe, it, expect } from "vitest";
import {
  shouldForceSignOut,
  APPLE_CRED_REVOKED,
  APPLE_CRED_NOT_FOUND,
} from "../../client/src/lib/apple-credential";

// Numeric mirror of AppleAuthenticationCredentialState.
const AUTHORIZED = 1;
const TRANSFERRED = 3;

describe("shouldForceSignOut (client defence-in-depth)", () => {
  it("forces sign-out when Apple reports REVOKED", () => {
    expect(shouldForceSignOut(APPLE_CRED_REVOKED)).toBe(true);
  });
  it("forces sign-out when Apple reports NOT_FOUND", () => {
    expect(shouldForceSignOut(APPLE_CRED_NOT_FOUND)).toBe(true);
  });
  it("keeps the session when AUTHORIZED", () => {
    expect(shouldForceSignOut(AUTHORIZED)).toBe(false);
  });
  it("keeps the session when TRANSFERRED (app team transfer, still valid)", () => {
    expect(shouldForceSignOut(TRANSFERRED)).toBe(false);
  });
});
