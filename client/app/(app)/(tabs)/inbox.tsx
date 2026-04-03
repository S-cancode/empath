import React, { useRef, useState, useCallback } from "react";
// useState still used for selectedIds
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Animated,
  Alert,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { useConversations } from "@/hooks/queries/useConversations";
import { useConversationsStore } from "@/stores/conversations.store";
import { useArchiveConversation } from "@/hooks/mutations/useArchiveConversation";
import { useArchivedConversations } from "@/hooks/queries/useArchivedConversations";
import { deleteConversation } from "@/api/conversations.api";
import { Ionicons } from "@expo/vector-icons";
import { Avatar } from "@/components/ui/Avatar";
import { AppBackground } from "@/components/ui/AppBackground";
import { queryClient } from "@/providers/QueryProvider";
import { queryKeys } from "@/lib/query-keys";
import type { Conversation } from "@/types/api";

function formatTime(dateStr: string | null) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}min`;
  if (diffHr < 24) return `${diffHr}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString([], { day: "numeric", month: "short" });
}

function renderRightActions(
  _progress: Animated.AnimatedInterpolation<number>,
  dragX: Animated.AnimatedInterpolation<number>,
) {
  const scale = dragX.interpolate({
    inputRange: [-100, 0],
    outputRange: [1, 0.5],
    extrapolate: "clamp",
  });
  const opacity = dragX.interpolate({
    inputRange: [-80, -40, 0],
    outputRange: [1, 0.5, 0],
    extrapolate: "clamp",
  });

  return (
    <Animated.View style={[styles.archiveAction, { opacity }]}>
      <Animated.Text style={[styles.archiveActionText, { transform: [{ scale }] }]}>
        Archive
      </Animated.Text>
    </Animated.View>
  );
}

function ConversationRow({
  item,
  onPress,
  onArchive,
  editMode,
  selected,
  onToggleSelect,
}: {
  item: Conversation;
  onPress: () => void;
  onArchive: () => void;
  editMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const unread = useConversationsStore((s) => s.unreadCounts[item.id] ?? 0);
  const isOnline = useConversationsStore((s) => s.presence[item.id]);
  const nickname = useConversationsStore((s) => s.nicknames[item.id]);
  const swipeableRef = useRef<Swipeable>(null);

  const displayName = nickname || item.partner.anonymousAlias;
  const hasUnread = unread > 0;

  const handleSwipeOpen = () => {
    onArchive();
    swipeableRef.current?.close();
  };

  const rowContent = (
    <TouchableOpacity
      style={[styles.row, hasUnread && styles.rowUnread]}
      onPress={editMode ? onToggleSelect : onPress}
      activeOpacity={0.7}
    >
      {editMode && (
        <View style={styles.checkboxContainer}>
          {selected ? (
            <View style={styles.checkboxSelected}>
              <Ionicons name="checkmark" size={16} color="#fff" />
            </View>
          ) : (
            <View style={styles.checkboxEmpty} />
          )}
        </View>
      )}
      <View style={styles.avatarContainer}>
        <Avatar alias={displayName} size={50} />
        {isOnline && <View style={styles.onlineDot} />}
      </View>
      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <Text style={[styles.alias, hasUnread && styles.aliasUnread]} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={[styles.time, hasUnread && styles.timeUnread]}>
            {formatTime(item.lastMessageAt)}
          </Text>
        </View>
        <Text style={[styles.preview, hasUnread && styles.previewUnread]} numberOfLines={1}>
          {item.category.replace("-", " ")}
        </Text>
      </View>
      {hasUnread && !editMode && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadCount}>{unread > 9 ? "9+" : unread}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  if (editMode) return rowContent;

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      onSwipeableWillOpen={handleSwipeOpen}
      rightThreshold={150}
      overshootRight={false}
      friction={1.5}
    >
      {rowContent}
    </Swipeable>
  );
}

export default function InboxScreen() {
  const router = useRouter();
  const { data: conversations, isLoading, refetch } = useConversations();
  const { data: archivedConversations } = useArchivedConversations();
  const archiveConversation = useArchiveConversation();
  const archivedCount = archivedConversations?.length ?? 0;
  const editMode = useConversationsStore((s) => s.chatEditMode);
  const setChatEditMode = useConversationsStore((s) => s.setChatEditMode);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exitEditMode = () => {
    setChatEditMode(false);
    setSelectedIds(new Set());
  };

  const handleArchiveSelected = () => {
    for (const id of selectedIds) {
      archiveConversation.mutate(id);
    }
    exitEditMode();
  };

  const handleDeleteSelected = () => {
    const count = selectedIds.size;
    Alert.alert(
      "Delete conversations",
      `Delete ${count} conversation${count > 1 ? "s" : ""}? Your messages will be permanently removed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            for (const id of selectedIds) {
              try { await deleteConversation(id); } catch {}
            }
            queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
            queryClient.invalidateQueries({ queryKey: queryKeys.archivedConversations });
            exitEditMode();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <AppBackground />

      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ConversationRow
            item={item}
            onPress={() => router.push(`/(app)/chat/${item.id}`)}
            onArchive={() => archiveConversation.mutate(item.id)}
            editMode={editMode}
            selected={selectedIds.has(item.id)}
            onToggleSelect={() => toggleSelect(item.id)}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={[
          styles.list,
          conversations?.length === 0 && styles.emptyContainer,
        ]}
        ListHeaderComponent={
          <TouchableOpacity
            style={[styles.archivedRow, editMode && styles.archivedRowDisabled]}
            onPress={editMode ? undefined : () => router.push("/(app)/archived")}
            activeOpacity={editMode ? 1 : 0.6}
            disabled={editMode}
          >
            <Ionicons name="archive-outline" size={22} color={editMode ? colors.textTertiary : colors.textSecondary} />
            <Text style={[styles.archivedRowText, editMode && styles.archivedRowTextDisabled]}>Archived</Text>
            <Text style={[styles.archivedRowCount, editMode && styles.archivedRowTextDisabled]}>{archivedCount}</Text>
          </TouchableOpacity>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptySubtitle}>
              Find a match in Explore to start chatting
            </Text>
          </View>
        }
      />

      {/* Bottom action bar in edit mode */}
      {editMode && selectedIds.size > 0 && (
        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.bottomAction} onPress={handleArchiveSelected}>
            <Text style={styles.bottomActionText}>Archive</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.bottomAction} onPress={handleDeleteSelected}>
            <Text style={[styles.bottomActionText, { color: colors.error }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  archivedRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 4,
    marginBottom: 8,
    gap: 12,
  },
  archivedRowText: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: colors.text,
  },
  archivedRowCount: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: colors.textTertiary,
  },
  archivedRowDisabled: {
    opacity: 0.4,
  },
  archivedRowTextDisabled: {
    color: colors.textTertiary,
  },
  list: {
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  rowUnread: {
    backgroundColor: colors.primaryLight + "18",
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  checkboxContainer: {
    marginRight: 12,
  },
  checkboxEmpty: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.textTertiary,
  },
  checkboxSelected: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarContainer: {
    position: "relative",
  },
  onlineDot: {
    position: "absolute",
    bottom: 1,
    right: 1,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: colors.online,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  rowContent: {
    flex: 1,
    marginLeft: 14,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  alias: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: colors.text,
    flex: 1,
  },
  aliasUnread: {
    fontFamily: "Inter_700Bold",
  },
  time: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: colors.textTertiary,
    marginLeft: 8,
  },
  timeUnread: {
    color: colors.primary,
    fontFamily: "Inter_600SemiBold",
  },
  preview: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: colors.textSecondary,
    marginTop: 3,
  },
  previewUnread: {
    color: colors.text,
    fontFamily: "Inter_500Medium",
  },
  unreadBadge: {
    marginLeft: 8,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 6,
  },
  unreadCount: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: colors.textInverse,
  },
  archiveAction: {
    backgroundColor: colors.error,
    justifyContent: "center",
    alignItems: "center",
    width: 90,
    borderRadius: 16,
    marginLeft: 8,
  },
  archiveActionText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  separator: {
    height: 8,
  },
  emptyContainer: {
    flex: 1,
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: "center",
  },
  bottomBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 14,
    paddingBottom: 28,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
  },
  bottomAction: {
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  bottomActionText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: colors.primary,
  },
});
