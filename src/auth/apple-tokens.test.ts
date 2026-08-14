import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateKeyPairSync } from "node:crypto";

// A real P-256 key so generateClientSecret actually signs a valid ES256 JWT.
const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const APPLE_PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const { cfg } = vi.hoisted(() => ({
  cfg: {
    ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    APPLE_BUNDLE_ID: "com.shivandongha.empath",
    APPLE_TEAM_ID: undefined as string | undefined,
    APPLE_KEY_ID: undefined as string | undefined,
    APPLE_PRIVATE_KEY: undefined as string | undefined,
    APPLE_CLIENT_ID: undefined as string | undefined,
  } as Record<string, unknown>,
}));
vi.mock("../config/index.js", () => ({ config: cfg }));

import {
  isAppleServerConfigured,
  exchangeAuthorizationCode,
  revokeRefreshToken,
  encryptAppleRefreshToken,
  decryptAppleRefreshToken,
} from "./apple-tokens.js";

function configureApple() {
  cfg.APPLE_TEAM_ID = "TEAM123456";
  cfg.APPLE_KEY_ID = "KEY1234567";
  cfg.APPLE_PRIVATE_KEY = APPLE_PEM;
  cfg.APPLE_CLIENT_ID = "com.shivandongha.empath";
}
function unconfigureApple() {
  cfg.APPLE_TEAM_ID = undefined;
  cfg.APPLE_KEY_ID = undefined;
  cfg.APPLE_PRIVATE_KEY = undefined;
  cfg.APPLE_CLIENT_ID = undefined;
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  unconfigureApple();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isAppleServerConfigured", () => {
  it("is false without credentials, true with them", () => {
    expect(isAppleServerConfigured()).toBe(false);
    configureApple();
    expect(isAppleServerConfigured()).toBe(true);
  });
});

describe("exchangeAuthorizationCode", () => {
  it("returns null (no network) when the server is unconfigured", async () => {
    const r = await exchangeAuthorizationCode("auth-code-xyz");
    expect(r).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exchanges the code and returns the refresh token; never leaks the code in logs", async () => {
    configureApple();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ refresh_token: "apple-refresh-abc", access_token: "x" }),
    });

    const r = await exchangeAuthorizationCode("secret-auth-code");
    expect(r).toBe("apple-refresh-abc");

    // The request went to Apple's token endpoint with the right grant type and
    // a signed client secret (not the raw private key).
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("appleid.apple.com/auth/token");
    const body = (init.body as URLSearchParams).toString();
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("client_secret=");
    expect(body).not.toContain("BEGIN+PRIVATE"); // never sends the raw key

    // No secret leaked to logs.
    for (const spy of [errSpy, logSpy]) {
      for (const call of spy.mock.calls) {
        const line = call.join(" ");
        expect(line).not.toContain("secret-auth-code");
        expect(line).not.toContain("apple-refresh-abc");
      }
    }
    errSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("throws on a non-2xx Apple response (invalid response handled)", async () => {
    configureApple();
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({}) });
    await expect(exchangeAuthorizationCode("bad")).rejects.toThrow(/exchange failed: 400/);
  });

  it("returns null when Apple returns no refresh token", async () => {
    configureApple();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ access_token: "only" }) });
    expect(await exchangeAuthorizationCode("code")).toBeNull();
  });
});

describe("revokeRefreshToken", () => {
  it("throws when unconfigured", async () => {
    await expect(revokeRefreshToken("t")).rejects.toThrow(/not configured/);
  });

  it("posts to the revoke endpoint and resolves on 200", async () => {
    configureApple();
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    await expect(revokeRefreshToken("apple-refresh-abc")).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("appleid.apple.com/auth/revoke");
    expect((init.body as URLSearchParams).toString()).toContain("token_type_hint=refresh_token");
  });

  it("throws on a transient failure so deletion can report it", async () => {
    configureApple();
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    await expect(revokeRefreshToken("t")).rejects.toThrow(/revoke failed: 503/);
  });
});

describe("token encryption at rest", () => {
  it("stores the refresh token encrypted (ciphertext != plaintext) and round-trips", () => {
    const cols = encryptAppleRefreshToken("apple-refresh-secret");
    expect(cols.appleRefreshTokenCipher).toBeTruthy();
    expect(cols.appleRefreshTokenCipher).not.toContain("apple-refresh-secret");
    expect(decryptAppleRefreshToken(cols)).toBe("apple-refresh-secret");
  });

  it("returns null for a legacy user with no stored token", () => {
    expect(
      decryptAppleRefreshToken({
        appleRefreshTokenCipher: null,
        appleRefreshTokenIv: null,
        appleRefreshTokenAuthTag: null,
      }),
    ).toBeNull();
  });
});
