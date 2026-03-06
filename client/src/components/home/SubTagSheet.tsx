import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { Button } from "@/components/ui/Button";
import { LockIcon } from "@/components/ui/LockIcon";
import type { Category, SubTag } from "@/types/api";

interface SubTagSheetProps {
  visible: boolean;
  category: Category | null;
  onDismiss: () => void;
  onFindMatch: (category: string, subTag?: string) => void;
  onUpgradeRequired: () => void;
  loading?: boolean;
}

export function SubTagSheet({
  visible,
  category,
  onDismiss,
  onFindMatch,
  onUpgradeRequired,
  loading,
}: SubTagSheetProps) {
  const [selectedTag, setSelectedTag] = useState<string | undefined>();

  if (!category) return null;

  const handleTagPress = (tag: SubTag) => {
    if (tag.premiumOnly && !tag.available) {
      onUpgradeRequired();
      return;
    }
    setSelectedTag(selectedTag === tag.id ? undefined : tag.id);
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <View style={styles.handle} />
          <Text style={styles.title}>{category.name}</Text>
          <Text style={styles.description}>{category.description}</Text>

          <Text style={styles.sectionLabel}>Choose a topic (optional)</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tagScroll}
          >
            {category.subTags.map((tag) => {
              const locked = tag.premiumOnly && !tag.available;
              const selected = selectedTag === tag.id;
              return (
                <TouchableOpacity
                  key={tag.id}
                  style={[
                    styles.tag,
                    selected && styles.tagSelected,
                    locked && styles.tagLocked,
                  ]}
                  onPress={() => handleTagPress(tag)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.tagText,
                      selected && styles.tagTextSelected,
                      locked && styles.tagTextLocked,
                    ]}
                  >
                    {tag.name}
                  </Text>
                  {locked && <LockIcon size={12} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Button
            title="Find a Match"
            onPress={() => onFindMatch(category.id, selectedTag)}
            loading={loading}
            style={{ marginTop: 16 }}
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
    marginBottom: 4,
  },
  description: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: 20,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
  },
  tagScroll: {
    flexDirection: "row",
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.borderLight,
    marginRight: 8,
  },
  tagSelected: {
    backgroundColor: colors.primary,
  },
  tagLocked: {
    backgroundColor: colors.borderLight,
    opacity: 0.7,
  },
  tagText: {
    ...typography.bodySmall,
    color: colors.text,
  },
  tagTextSelected: {
    color: colors.textInverse,
  },
  tagTextLocked: {
    color: colors.textTertiary,
  },
});
