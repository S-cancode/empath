import { prisma } from "../lib/prisma.js";

/**
 * Canonical compliance gate. One source of truth for "may this account use
 * the platform", enforced server-side. Client-supplied versions/hashes are
 * never consulted — canonical terms/consent versions come from the database.
 *
 * Checked (in order): account exists & not deleted, not banned, not
 * suspended, server-recorded 18+ confirmation, recorded date of birth still
 * 18+, current canonical terms version accepted, current canonical
 * sensitive-data consent granted and not withdrawn.
 */

export type ComplianceFailure =
  | "account_deleted"
  | "banned"
  | "suspended"
  | "age_not_confirmed"
  | "underage"
  | "terms_outdated"
  | "consent_required"
  | "check_failed";

export interface ComplianceResult {
  ok: boolean;
  reason?: ComplianceFailure;
  suspendedUntil?: Date;
}

const SENSITIVE_CONSENT_TYPE = "sensitive_data";

// Canonical versions change only on legal-text deploys; cache briefly.
const CANONICAL_TTL_MS = 60_000;
let canonicalCache: { terms: string | null; consent: string | null; expiresAt: number } | null =
  null;

export function invalidateCanonicalVersionCache(): void {
  canonicalCache = null;
}

async function getCanonicalVersions(): Promise<{ terms: string | null; consent: string | null }> {
  if (canonicalCache && Date.now() < canonicalCache.expiresAt) {
    return canonicalCache;
  }
  const now = new Date();
  const [terms, consent] = await Promise.all([
    prisma.termsVersion.findFirst({
      where: { effectiveFrom: { lte: now } },
      orderBy: { effectiveFrom: "desc" },
      select: { version: true },
    }),
    prisma.consentTextVersion.findFirst({
      where: { consentType: SENSITIVE_CONSENT_TYPE, effectiveFrom: { lte: now } },
      orderBy: { effectiveFrom: "desc" },
      select: { version: true },
    }),
  ]);
  canonicalCache = {
    terms: terms?.version ?? null,
    consent: consent?.version ?? null,
    expiresAt: Date.now() + CANONICAL_TTL_MS,
  };
  return canonicalCache;
}

function isUnder18(dateOfBirth: Date, now: Date): boolean {
  const adultAt = new Date(dateOfBirth);
  adultAt.setFullYear(adultAt.getFullYear() + 18);
  return adultAt > now;
}

export async function checkUserCompliance(userId: string): Promise<ComplianceResult> {
  try {
    const now = new Date();
    const [canonical, user] = await Promise.all([
      getCanonicalVersions(),
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          deletedAt: true,
          banned: true,
          suspendedUntil: true,
          ageConfirmedAt: true,
          dateOfBirth: true,
          sensitiveDataConsent: true,
          termsAcceptances: {
            orderBy: { acceptedAt: "desc" },
            take: 1,
            select: { termsVersion: true },
          },
          consentRecords: {
            where: { consentType: SENSITIVE_CONSENT_TYPE, granted: true, withdrawnAt: null },
            orderBy: { recordedAt: "desc" },
            take: 1,
            select: { consentVersion: true },
          },
        },
      }),
    ]);

    if (!user || user.deletedAt) return { ok: false, reason: "account_deleted" };
    if (user.banned) return { ok: false, reason: "banned" };
    if (user.suspendedUntil && user.suspendedUntil > now) {
      return { ok: false, reason: "suspended", suspendedUntil: user.suspendedUntil };
    }
    if (!user.ageConfirmedAt) return { ok: false, reason: "age_not_confirmed" };
    if (user.dateOfBirth && isUnder18(user.dateOfBirth, now)) {
      return { ok: false, reason: "underage" };
    }
    if (
      !canonical.terms ||
      user.termsAcceptances[0]?.termsVersion !== canonical.terms
    ) {
      return { ok: false, reason: "terms_outdated" };
    }
    if (
      !user.sensitiveDataConsent ||
      !canonical.consent ||
      user.consentRecords[0]?.consentVersion !== canonical.consent
    ) {
      return { ok: false, reason: "consent_required" };
    }

    return { ok: true };
  } catch (err) {
    console.error("[compliance] check failed:", err);
    // Fail closed: an unverifiable account gets no access.
    return { ok: false, reason: "check_failed" };
  }
}

// ── Short-TTL per-user cache for hot paths (socket events) ────────────────
// Enforcement, consent withdrawal, and deletion invalidate synchronously, so
// a stale-positive window only exists for transitions that ALSO disconnect
// the socket — the cache can't outlive the connection it's protecting.

const USER_CACHE_TTL_MS = 30_000;
const userCache = new Map<string, { result: ComplianceResult; expiresAt: number }>();
const USER_CACHE_MAX = 10_000;

export function invalidateComplianceCache(userId?: string): void {
  if (userId === undefined) {
    userCache.clear();
    return;
  }
  userCache.delete(userId);
}

export async function checkUserComplianceCached(userId: string): Promise<ComplianceResult> {
  const cached = userCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) return cached.result;

  const result = await checkUserCompliance(userId);
  if (userCache.size > USER_CACHE_MAX) userCache.clear();
  userCache.set(userId, { result, expiresAt: Date.now() + USER_CACHE_TTL_MS });
  return result;
}
