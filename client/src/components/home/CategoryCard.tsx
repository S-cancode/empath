import React from "react";
import { TouchableOpacity, Text, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import type { Category } from "@/types/api";

const CATEGORY_ICONS: Record<string, { name: keyof typeof Ionicons.glyphMap; color: string }> = {
  "work-career": { name: "briefcase-outline", color: "#4A90D9" },
  relationships: { name: "heart-outline", color: "#E57373" },
  "financial-stress": { name: "wallet-outline", color: "#66BB6A" },
  grief: { name: "leaf-outline", color: "#AB47BC" },
  "academic-pressure": { name: "school-outline", color: "#FF7043" },
  health: { name: "fitness-outline", color: "#26A69A" },
  parenting: { name: "people-outline", color: "#FFA726" },
  identity: { name: "compass-outline", color: "#42A5F5" },
};

const DEFAULT_ICON = { name: "chatbubble-ellipses-outline" as keyof typeof Ionicons.glyphMap, color: colors.primary };

interface CategoryCardProps {
  category: Category;
  onPress: () => void;
}

export function CategoryCard({ category, onPress }: CategoryCardProps) {
  const icon = CATEGORY_ICONS[category.id] ?? DEFAULT_ICON;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.iconCircle, { backgroundColor: icon.color + "18" }]}>
        <Ionicons name={icon.name} size={24} color={icon.color} />
      </View>
      <Text style={styles.name} numberOfLines={2}>
        {category.name}
      </Text>
      <Text style={styles.tagCount}>
        {category.subTags.length} topics
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    margin: 6,
    minHeight: 120,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  name: {
    ...typography.h3,
    color: colors.text,
    marginBottom: 4,
  },
  tagCount: {
    ...typography.caption,
    color: colors.textTertiary,
  },
});
