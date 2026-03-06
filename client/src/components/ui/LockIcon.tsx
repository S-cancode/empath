import React from "react";
import { Text } from "react-native";

export function LockIcon({ size = 14 }: { size?: number }) {
  return <Text style={{ fontSize: size }}>&#128274;</Text>;
}
