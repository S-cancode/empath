export const colors = {
  // Warm, calming palette — inspired by Headspace/Calm
  primary: "#7C5CFC",        // Soft purple — trust, calm, empathy
  primaryLight: "#B4A0FF",
  primaryDark: "#5B3FD9",

  background: "#FAF8F5",     // Warm off-white — not clinical
  surface: "#FFFFFF",
  surfaceElevated: "#FFFFFF",

  text: "#1A1A2E",
  textSecondary: "#6B7280",
  textTertiary: "#9CA3AF",
  textInverse: "#FFFFFF",

  border: "#E8E5E0",
  borderLight: "#F5F3F0",

  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#7C5CFC",

  sent: "#9CA3AF",
  delivered: "#6B7280",
  read: "#7C5CFC",

  online: "#10B981",
  offline: "#9CA3AF",

  tierFree: "#6B7280",
  tierPremium: "#F59E0B",
  tierPlus: "#7C5CFC",

  lock: "#D1D5DB",

  // Subtle accent for cards and sections
  accent: "#F0EDFF",         // Very light purple tint
  accentWarm: "#FFF5EB",     // Warm peach tint

  bubble: {
    mine: "#7C5CFC",
    mineText: "#FFFFFF",
    theirs: "#F5F3F0",
    theirsText: "#1A1A2E",
  },
} as const;
