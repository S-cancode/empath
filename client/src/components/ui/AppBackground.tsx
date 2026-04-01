import React from "react";
import { View, StyleSheet } from "react-native";
import { colors } from "@/theme/colors";

/**
 * Clean, minimal background — warm off-white with a subtle
 * top-to-bottom gradient feel via a very faint overlay.
 * No icons, no noise. Calm and professional.
 */
export function AppBackground() {
  return (
    <View style={styles.container} pointerEvents="none">
      <View style={styles.topGlow} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    overflow: "hidden",
  },
  topGlow: {
    position: "absolute",
    top: -80,
    left: -40,
    right: -40,
    height: 260,
    borderRadius: 200,
    backgroundColor: colors.primaryLight,
    opacity: 0.08,
  },
});
