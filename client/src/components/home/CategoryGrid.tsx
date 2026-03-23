import React from "react";
import { View, StyleSheet } from "react-native";
import { CategoryCard } from "./CategoryCard";
import type { Category } from "@/types/api";

interface CategoryGridProps {
  categories: Category[];
  onSelectCategory: (category: Category) => void;
}

export function CategoryGrid({
  categories,
  onSelectCategory,
}: CategoryGridProps) {
  return (
    <View style={styles.grid}>
      {categories.map((item) => (
        <CategoryCard
          key={item.id}
          category={item}
          onPress={() => onSelectCategory(item)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 10,
  },
});
