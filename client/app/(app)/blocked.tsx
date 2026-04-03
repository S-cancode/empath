import React, { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { apiClient } from "@/api/client";
import { useConversationsStore } from "@/stores/conversations.store";
import { Avatar } from "@/components/ui/Avatar";
import { AppBackground } from "@/components/ui/AppBackground";

interface BlockedUser {
  id: string;
  userId: string;
  alias: string;
  blockedAt: string;
}

export default function BlockedUsersScreen() {
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const nicknames = useConversationsStore((s) => s.nicknames);

  const fetchBlocked = async () => {
    try {
      const { data } = await apiClient.get("/safety/blocked");
      setBlocked(data);
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBlocked(); }, []);

  const handleUnblock = (user: BlockedUser) => {
    const displayName = getDisplayName(user);
    Alert.alert(
      "Unblock user",
      `Unblock ${displayName}? You may be matched with them again.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unblock",
          onPress: async () => {
            try {
              await apiClient.delete(`/safety/block/${user.userId}`);
              setBlocked((prev) => prev.filter((b) => b.id !== user.id));
            } catch {
              Alert.alert("Error", "Something went wrong.");
            }
          },
        },
      ],
    );
  };

  // Find nickname from any conversation with this user
  const getDisplayName = (user: BlockedUser) => {
    // Check all nicknames — keys are conversationIds, not userIds
    // We can't easily map userId to conversationId here, so fall back to alias
    return user.alias || "Unknown";
  };

  return (
    <View style={styles.container}>
      <AppBackground />
      <FlatList
        data={blocked}
        keyExtractor={(item) => item.id}
        contentContainerStyle={blocked.length === 0 ? styles.emptyContainer : styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Avatar alias={item.alias} size={44} />
            <View style={styles.rowContent}>
              <Text style={styles.alias}>{item.alias}</Text>
              <Text style={styles.date}>
                Blocked {new Date(item.blockedAt).toLocaleDateString()}
              </Text>
            </View>
            <TouchableOpacity style={styles.unblockBtn} onPress={() => handleUnblock(item)}>
              <Text style={styles.unblockText}>Unblock</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {loading ? "Loading..." : "No blocked users"}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    padding: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: 14,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  rowContent: {
    flex: 1,
    marginLeft: 12,
  },
  alias: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: colors.text,
  },
  date: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: colors.textTertiary,
    marginTop: 2,
  },
  unblockBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  unblockText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: colors.primary,
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
  emptyText: {
    ...typography.body,
    color: colors.textTertiary,
  },
});
