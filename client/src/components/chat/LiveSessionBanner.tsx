import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { Button } from "@/components/ui/Button";

interface LiveSessionBannerProps {
  inviterAlias?: string;
  onAccept: () => void;
  onDecline: () => void;
}

export function LiveSessionBanner({
  inviterAlias,
  onAccept,
  onDecline,
}: LiveSessionBannerProps) {
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        {inviterAlias ?? "Your partner"} wants to start a live session
      </Text>
      <View style={styles.buttons}>
        <Button title="Accept" onPress={onAccept} style={{ flex: 1 }} />
        <Button
          title="Decline"
          variant="secondary"
          onPress={onDecline}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 16,
    margin: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.primaryLight + "40",
  },
  text: {
    ...typography.bodySmall,
    color: colors.primary,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 12,
    textAlign: "center",
  },
  buttons: {
    flexDirection: "row",
    gap: 8,
  },
});
