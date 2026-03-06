import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import type { Tier } from "@/types/api";

const tierColors: Record<Tier, string> = {
  free: colors.tierFree,
  premium: colors.tierPremium,
  plus: colors.tierPlus,
};

const tierLabels: Record<Tier, string> = {
  free: "FREE",
  premium: "PREMIUM",
  plus: "PLUS",
};

export function Badge({ tier }: { tier: Tier }) {
  return (
    <View style={[styles.badge, { backgroundColor: tierColors[tier] }]}>
      <Text style={styles.text}>{tierLabels[tier]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  text: {
    ...typography.caption,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
});
