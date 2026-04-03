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
  free: "10 matches per day",
  premium: "10 matches per day, sub-tags",
  plus: "Unlimited matches, all features",
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
