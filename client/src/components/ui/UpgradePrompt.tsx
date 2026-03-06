import React from "react";
import { View, Text, StyleSheet, Modal, Pressable } from "react-native";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { Button } from "./Button";

interface UpgradePromptProps {
  visible: boolean;
  requiredTier: "premium" | "plus";
  featureName: string;
  onDismiss: () => void;
}

export function UpgradePrompt({
  visible,
  requiredTier,
  featureName,
  onDismiss,
}: UpgradePromptProps) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Upgrade Required</Text>
          <Text style={styles.description}>
            {featureName} requires a{" "}
            <Text style={styles.tier}>
              {requiredTier.toUpperCase()}
            </Text>{" "}
            subscription.
          </Text>
          <Button title="Upgrade" onPress={onDismiss} />
          <Button
            title="Not now"
            variant="secondary"
            onPress={onDismiss}
            style={{ marginTop: 8 }}
          />
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: 20,
  },
  title: {
    ...typography.h2,
    color: colors.text,
    marginBottom: 8,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: 24,
  },
  tier: {
    fontFamily: "Inter_700Bold",
    color: colors.tierPremium,
  },
});
