import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { typography } from "@/theme/typography";

const AVATAR_COLORS = [
  "#8B9DC3", "#D4A5A5", "#7EC8B0", "#C9B99A", "#9BB5CE",
  "#D4B896", "#B8A9C9", "#E0AFA0", "#8CBCB9", "#A7C4BC",
];

function hashAlias(alias: string): number {
  let hash = 0;
  for (let i = 0; i < alias.length; i++) {
    hash = (hash * 31 + alias.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

interface AvatarProps {
  alias: string;
  size?: number;
}

export function Avatar({ alias, size = 40 }: AvatarProps) {
  const color = AVATAR_COLORS[hashAlias(alias) % AVATAR_COLORS.length];
  const initial = alias.charAt(0).toUpperCase();

  return (
    <View
      style={[
        styles.container,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
      ]}
    >
      <Text style={[styles.initial, { fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  initial: {
    ...typography.button,
    color: "#FFFFFF",
  },
});
