import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { Badge } from "@/components/ui/Badge";
import type { Tier, MatchStatus } from "@/types/api";

interface TierCardProps {
  tier: Tier;
  matchStatus?: MatchStatus;
}

const tierDescriptions: Record<Tier, string> = {
  free: "3 matches/day, 20 min live sessions",
  premium: "10 matches/day, 45 min live sessions, sub-tags",
  plus: "Unlimited matches, 60 min live sessions, all features",
};

export function TierCard({ tier, matchStatus }: TierCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.label}>Your Plan</Text>
        <Badge tier={tier} />
      </View>
      <Text style={styles.description}>{tierDescriptions[tier]}</Text>
      {matchStatus && matchStatus.limit > 0 && (
        <Text style={styles.matches}>
          {matchStatus.used}/{matchStatus.limit} matches used today
        </Text>
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
