import { ValidationError } from "../shared/errors.js";

/**
 * Structured matching profile (versioned). Hard compatibility filters run in
 * candidate selection BEFORE final scoring, so incompatible contexts never
 * pair regardless of embedding similarity.
 *
 * All fields optional for backward compatibility: a user without a profile is
 * compatible with anyone (falls back to pure similarity matching). Two users
 * only fail a filter when BOTH have explicitly-set, conflicting values.
 */

export const MATCH_PROFILE_VERSION = 1;

export const INTENTS = ["seek_support", "offer_support", "mutual"] as const;
export type Intent = (typeof INTENTS)[number];

export const INTERACTION_STYLES = ["one_off", "ongoing", "either"] as const;
export type InteractionStyle = (typeof INTERACTION_STYLES)[number];

export interface MatchProfile {
  version: number;
  intent?: Intent;
  interactionStyle?: InteractionStyle;
  // Advice boundary: does this person want to receive advice (vs. just be heard)?
  wantsAdvice?: boolean;
}

/**
 * Validate and normalize a client-supplied profile. Rejects unknown enum
 * values server-side (never silently drops them). Returns undefined for an
 * absent profile.
 */
export function validateMatchProfile(raw: unknown): MatchProfile | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object") throw new ValidationError("Invalid match profile");
  const p = raw as Record<string, unknown>;

  const profile: MatchProfile = { version: MATCH_PROFILE_VERSION };

  if (p.intent !== undefined) {
    if (!INTENTS.includes(p.intent as Intent)) {
      throw new ValidationError(`intent must be one of: ${INTENTS.join(", ")}`);
    }
    profile.intent = p.intent as Intent;
  }
  if (p.interactionStyle !== undefined) {
    if (!INTERACTION_STYLES.includes(p.interactionStyle as InteractionStyle)) {
      throw new ValidationError(
        `interactionStyle must be one of: ${INTERACTION_STYLES.join(", ")}`,
      );
    }
    profile.interactionStyle = p.interactionStyle as InteractionStyle;
  }
  if (p.wantsAdvice !== undefined) {
    if (typeof p.wantsAdvice !== "boolean") {
      throw new ValidationError("wantsAdvice must be a boolean");
    }
    profile.wantsAdvice = p.wantsAdvice;
  }

  return profile;
}

function intentsCompatible(a?: Intent, b?: Intent): boolean {
  if (!a || !b) return true; // unset → no constraint
  // A pure seeker needs someone willing to offer (offer_support or mutual);
  // two pure seekers or two pure offerers are a poor pairing.
  if (a === "seek_support" && b === "seek_support") return false;
  if (a === "offer_support" && b === "offer_support") return false;
  return true;
}

function stylesCompatible(a?: InteractionStyle, b?: InteractionStyle): boolean {
  if (!a || !b) return true;
  if (a === "either" || b === "either") return true;
  // one_off vs ongoing is a hard mismatch of expectations.
  return a === b;
}

/**
 * Hard compatibility gate between two match profiles. Returns false only when
 * both parties have explicitly-set, conflicting preferences.
 */
export function areCompatible(a?: MatchProfile, b?: MatchProfile): boolean {
  if (!a || !b) return true;
  return (
    intentsCompatible(a.intent, b.intent) &&
    stylesCompatible(a.interactionStyle, b.interactionStyle)
  );
}

/** Non-sensitive, user-facing reason a pair was matched (no health/topic data). */
export function matchRationale(a?: MatchProfile, b?: MatchProfile): string {
  const bits: string[] = [];
  if (a?.interactionStyle && b?.interactionStyle && a.interactionStyle === b.interactionStyle && a.interactionStyle !== "either") {
    bits.push(a.interactionStyle === "ongoing" ? "both open to ongoing support" : "both here for a one-off chat");
  }
  if (a?.intent && b?.intent && (a.intent === "mutual" || b.intent === "mutual")) {
    bits.push("open to giving and receiving support");
  }
  return bits.length > 0 ? `Matched because you're ${bits.join(" and ")}.` : "Matched on what you shared.";
}

/** Extract a MatchProfile from a queue entry's matchContext.profile (if any). */
export function profileFromContext(ctx: unknown): MatchProfile | undefined {
  if (!ctx || typeof ctx !== "object") return undefined;
  const profile = (ctx as Record<string, unknown>).profile;
  if (!profile || typeof profile !== "object") return undefined;
  return profile as MatchProfile;
}
