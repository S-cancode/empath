import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { typography } from "@/theme/typography";

const AVATAR_COLORS = [
  "#8B9DC3", "#D4A5A5", "#7EC8B0", "#C9B99A", "#9BB5CE",
  "#D4B896", "#B8A9C9", "#E0AFA0", "#8CBCB9", "#A7C4BC",
  "#C4A3D4", "#A5C4D4", "#D4C9A5", "#A5D4B8", "#D4A5C0",
  "#9CC3B0", "#C3A89C", "#A0BCD4", "#D4B0A0", "#B0C9A5",
];

function hashAlias(alias: string): number {
  let hash = 5381;
  for (let i = 0; i < alias.length; i++) {
    hash = ((hash << 5) + hash + alias.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

interface AvatarProps {
  alias: string;
  size?: number;
}

export function Avatar({ alias, size = 40 }: AvatarProps) {
  const color = AVATAR_COLORS[hashAlias(alias) % AVATAR_COLORS.length];
  const initial = alias.slice(0, 2).toUpperCase();

  return (
    <View
      style={[
        styles.container,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
      ]}
    >
      <Text style={[styles.initial, { fontSize: size * 0.32, lineHeight: size * 0.4 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  initial: {
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    textAlign: "center",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
});
