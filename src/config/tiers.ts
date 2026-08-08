import { SubscriptionTier } from "../shared/types.js";

export interface TierLimits {
  dailyNewMatches: number; // 0 = unlimited
  liveSessionDurationMs: number;
  extendedDurationMs: number;
  canExtendSession: boolean;
  canUseSubTags: boolean;
  priorityMatching: boolean;
  priorityScoreOffset: number;
  canReconnectArchived: boolean;
  canUseVoiceNotes: boolean;
  canScheduleSessions: boolean;
  canUseJournaling: boolean;
  canViewPostSessionSummary: boolean;
  canSetMatchPreferences: boolean;
  autoArchiveDays: number;
}

export const tierConfig: Record<SubscriptionTier, TierLimits> = {
  // v1 ships a single free tier. FREE gets every WORKING feature so nothing is
  // shown-but-locked (Apple 2.1/3.1.1). Features whose endpoints are still 501
  // stubs (journaling, scheduling, post-session summary, match preferences) and
  // stub-only features (journaling, scheduling, summary, preferences) stay off
  // and have no client surface. Voice notes are available (guarded server-side).
  [SubscriptionTier.FREE]: {
    dailyNewMatches: 10,
    liveSessionDurationMs: 45 * 60 * 1000,
    extendedDurationMs: 10 * 60 * 1000,
    canExtendSession: true,
    canUseSubTags: true,
    priorityMatching: false,
    priorityScoreOffset: 0,
    canReconnectArchived: true,
    canUseVoiceNotes: true,
    canScheduleSessions: false,
    canUseJournaling: false,
    canViewPostSessionSummary: false,
    canSetMatchPreferences: false,
    autoArchiveDays: 7,
  },
  [SubscriptionTier.PREMIUM]: {
    dailyNewMatches: 10,
    liveSessionDurationMs: 45 * 60 * 1000,
    extendedDurationMs: 10 * 60 * 1000,
    canExtendSession: true,
    canUseSubTags: true,
    priorityMatching: true,
    priorityScoreOffset: -60_000,
    canReconnectArchived: true,
    canUseVoiceNotes: false,
    canScheduleSessions: false,
    canUseJournaling: true,
    canViewPostSessionSummary: true,
    canSetMatchPreferences: true,
    autoArchiveDays: 7,
  },
  [SubscriptionTier.PLUS]: {
    dailyNewMatches: 0,
    liveSessionDurationMs: 60 * 60 * 1000,
    extendedDurationMs: 10 * 60 * 1000,
    canExtendSession: true,
    canUseSubTags: true,
    priorityMatching: true,
    priorityScoreOffset: -60_000,
    canReconnectArchived: true,
    canUseVoiceNotes: true,
    canScheduleSessions: true,
    canUseJournaling: true,
    canViewPostSessionSummary: true,
    canSetMatchPreferences: true,
    autoArchiveDays: 7,
  },
};

export function getTierLimits(tier: string): TierLimits {
  return tierConfig[tier as SubscriptionTier] ?? tierConfig[SubscriptionTier.FREE];
}
