import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import type { MatchStatus } from "@/types/api";

export function MatchCounter({ status }: { status: MatchStatus | undefined }) {
  if (!status) return null;

  const isUnlimited = status.limit === 0;
  const isExhausted = !isUnlimited && status.remaining === 0;
  const hours = Math.ceil(status.resetsInSeconds / 3600);

  return (
    <View style={[styles.container, isExhausted && styles.exhausted]}>
      {isUnlimited ? (
        <Text style={styles.text}>Unlimited matches</Text>
      ) : (
        <>
          <Text style={[styles.text, isExhausted && styles.exhaustedText]}>
            {status.used} of {status.limit} matches used today
          </Text>
          {isExhausted && (
            <Text style={styles.resetText}>Resets in ~{hours}h</Text>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.primaryLight + "20",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    alignItems: "center",
  },
  exhausted: {
    backgroundColor: colors.error + "15",
  },
  text: {
    ...typography.bodySmall,
    color: colors.primary,
    fontFamily: "Inter_600SemiBold",
  },
  exhaustedText: {
    color: colors.error,
  },
  resetText: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
});
