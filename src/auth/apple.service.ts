import { createRemoteJWKSet, jwtVerify } from "jose";
import { prisma } from "../lib/prisma.js";
import { config } from "../config/index.js";
import { AuthError, ForbiddenError } from "../shared/errors.js";
import { generateAlias, hashDeviceId, issueTokens } from "./auth.service.js";

const APPLE_ISSUER = "https://appleid.apple.com";

// Remote JWKS is fetched lazily on first verify and cached by jose.
const appleJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

interface AppleIdentity {
  sub: string;
  email?: string;
}

async function verifyIdentityToken(identityToken: string): Promise<AppleIdentity> {
  try {
    const { payload } = await jwtVerify(identityToken, appleJwks, {
      issuer: APPLE_ISSUER,
      audience: config.APPLE_BUNDLE_ID,
    });
    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      throw new Error("missing sub");
    }
    return {
      sub: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
    };
  } catch {
    throw new AuthError("Invalid Apple identity token");
  }
}

/**
 * Sign in with Apple: the durable identity path. The Apple `sub` is the
 * enforcement anchor — bans, blocks, reports, and consent history must
 * survive reinstalls and device changes, so accounts key on it.
 *
 * Public presentation stays pseudonymous: peers only ever see the alias.
 */
export async function signInWithApple(identityToken: string, deviceId: string) {
  const identity = await verifyIdentityToken(identityToken);
  const hashedDeviceId = hashDeviceId(deviceId);

  let user = await prisma.user.findUnique({ where: { appleSub: identity.sub } });

  // Erased accounts stay erased (right to erasure): the person may return,
  // their data may not. Free the unique appleSub and fall through to a
  // fresh account.
  if (user?.deletedAt) {
    await prisma.user.update({
      where: { id: user.id },
      data: { appleSub: null },
    });
    user = null;
  }

  if (!user) {
    // Link path: if this device already has an anonymous account, attach the
    // Apple identity to it rather than minting a new user — enforcement
    // history (reports, blocks, suspensions) must not be shed by upgrading.
    const deviceUser = await prisma.user.findFirst({
      where: { deviceId: hashedDeviceId, appleSub: null, deletedAt: null },
    });
    if (deviceUser) {
      user = await prisma.user.update({
        where: { id: deviceUser.id },
        data: { appleSub: identity.sub, email: deviceUser.email ?? identity.email ?? null },
      });
    }
  }

  if (!user) {
    user = await prisma.user.create({
      data: {
        appleSub: identity.sub,
        email: identity.email ?? null,
        deviceId: hashedDeviceId,
        anonymousAlias: generateAlias(),
      },
    });
  }

  if (user.banned) {
    throw new ForbiddenError("This account has been permanently banned");
  }

  return { ...issueTokens(user), user: { id: user.id, alias: user.anonymousAlias } };
}
