import React from "react";
import { FlatList, StyleSheet } from "react-native";
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
    <FlatList
      data={categories}
      keyExtractor={(item) => item.id}
      numColumns={2}
      contentContainerStyle={styles.grid}
      renderItem={({ item }) => (
        <CategoryCard
          category={item}
          onPress={() => onSelectCategory(item)}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  grid: {
    padding: 10,
  },
});
