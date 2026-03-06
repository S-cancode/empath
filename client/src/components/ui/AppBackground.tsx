import React, { useMemo } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import Svg, { Path, G } from "react-native-svg";
import { colors } from "@/theme/colors";

// Each icon is a 24x24 SVG path — thin line-art style doodles
// Themed around emotional support, connection, happiness, and help
const ICON_PATHS: string[] = [
  // Heart outline
  "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
  // Hands holding (support)
  "M16 4c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2zM4 4c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2zm5 8v8h2v-8l3-3-1.4-1.4L10 10.2 7.4 7.6 6 9l3 3zm6 0v8h2v-8l3-3-1.4-1.4L16 10.2l-2.6-2.6L12 9l3 3z",
  // Chat bubble
  "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z",
  // Sun (happiness)
  "M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 000-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z",
  // Shield (safety)
  "M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 2.18l7 3.12v4.7c0 4.83-3.23 9.36-7 10.62-3.77-1.26-7-5.79-7-10.62V6.3l7-3.12z",
  // Two people (connection)
  "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
  // Leaf (growth)
  "M17.75 4.09L15.22 6.03l-2.28-.36c-.38-.06-.74.15-.88.5L6 21l.69.31c.84.37 1.81.12 2.37-.58l3.02-3.79 2.52.4c.38.06.74-.15.88-.5l1.57-3.92 2.53-1.94c.31-.24.44-.65.32-1.03l-1.21-3.74c-.13-.38-.49-.63-.89-.62l-.05.01z",
  // Star
  "M12 2l2.94 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 7.06-1.01L12 2z",
  // Lightbulb (ideas/hope)
  "M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6A4.997 4.997 0 017 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z",
  // Dove/peace bird
  "M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z",
  // Handshake circle
  "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-6l-2-2-1.41 1.41L11 16.17l6.71-6.71L16.29 8 11 13.29z",
  // Hug / open arms
  "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5-5h2v2H7v-2zm8 0h2v2h-2v-2zm-4-6c-1.66 0-3 1.34-3 3h2c0-.55.45-1 1-1s1 .45 1 1h2c0-1.66-1.34-3-3-3z",
];

const ICON_SIZE = 20;
const SPACING = 56;
const COLOR = colors.primaryLight;
const OPACITY = 0.28;

export function AppBackground() {
  const { width, height } = Dimensions.get("window");

  const items = useMemo(() => {
    const cols = Math.ceil(width / SPACING) + 1;
    const rows = Math.ceil(height / SPACING) + 1;
    const result: { pathIdx: number; x: number; y: number; rotate: number }[] =
      [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const pathIdx = (row * cols + col) % ICON_PATHS.length;
        const offsetX = row % 2 === 0 ? 0 : SPACING / 2;
        result.push({
          pathIdx,
          x: col * SPACING + offsetX,
          y: row * SPACING,
          rotate: (row * 7 + col * 13) % 360,
        });
      }
    }
    return result;
  }, [width, height]);

  return (
    <View style={styles.container} pointerEvents="none">
      <Svg width={width} height={height}>
        {items.map((item, i) => (
          <G
            key={i}
            transform={`translate(${item.x}, ${item.y}) rotate(${item.rotate}, ${ICON_SIZE / 2}, ${ICON_SIZE / 2})`}
            opacity={OPACITY}
          >
            <Path
              d={ICON_PATHS[item.pathIdx]}
              fill="none"
              stroke={COLOR}
              strokeWidth={1.2}
              transform={`scale(${ICON_SIZE / 24})`}
            />
          </G>
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
});
