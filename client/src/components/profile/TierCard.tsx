import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import type { Tier, MatchStatus } from "@/types/api";

interface TierCardProps {
  // Kept for call-site compatibility; v1 has a single free tier and shows no
  // plan/tier/upgrade framing.
  tier?: Tier;
  matchStatus?: MatchStatus;
}

export function TierCard({ matchStatus }: TierCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>Daily matches</Text>
      {matchStatus && matchStatus.limit > 0 ? (
        <Text style={styles.matches}>
          {matchStatus.used}/{matchStatus.limit} used today
        </Text>
      ) : (
        <Text style={styles.matches}>Unlimited</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 16,
    marginVertical: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  label: {
    ...typography.h3,
    color: colors.text,
  },
  description: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  matches: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 8,
  },
});
