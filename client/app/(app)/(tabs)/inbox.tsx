import React, { useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Animated,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { useConversations } from "@/hooks/queries/useConversations";
import { useConversationsStore } from "@/stores/conversations.store";
import { useArchiveConversation } from "@/hooks/mutations/useArchiveConversation";
import { Avatar } from "@/components/ui/Avatar";
import { AppBackground } from "@/components/ui/AppBackground";
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
  progress: Animated.AnimatedInterpolation<number>,
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
}: {
  item: Conversation;
  onPress: () => void;
  onArchive: () => void;
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

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      onSwipeableOpen={handleSwipeOpen}
      rightThreshold={200}
      overshootRight={false}
      friction={2}
    >
      <TouchableOpacity
        style={[styles.row, hasUnread && styles.rowUnread]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <View style={styles.avatarContainer}>
          <Avatar alias={item.partner.anonymousAlias} size={50} />
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
        {hasUnread && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadCount}>{unread > 9 ? "9+" : unread}</Text>
          </View>
        )}
      </TouchableOpacity>
    </Swipeable>
  );
}

export default function InboxScreen() {
  const router = useRouter();
  const { data: conversations, isLoading, refetch } = useConversations();
  const archiveConversation = useArchiveConversation();

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppBackground />
      <View style={styles.header}>
        <Text style={styles.title}>Chats</Text>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ConversationRow
            item={item}
            onPress={() => router.push(`/(app)/chat/${item.id}`)}
            onArchive={() => archiveConversation.mutate(item.id)}
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
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptySubtitle}>
              Find a match in Explore to start chatting
            </Text>
          </View>
        }
        ListFooterComponent={
          conversations && conversations.length > 0 ? (
            <TouchableOpacity
              style={styles.archivedLink}
              onPress={() => router.push("/(app)/archived")}
            >
              <Text style={styles.archivedText}>
                View archived conversations
              </Text>
            </TouchableOpacity>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: colors.text,
    letterSpacing: -0.3,
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
  },
  rowUnread: {
    backgroundColor: colors.primaryLight + "18",
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
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
  archivedLink: {
    padding: 16,
    alignItems: "center",
  },
  archivedText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: colors.primary,
  },
});
