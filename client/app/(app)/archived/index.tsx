import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { useArchivedConversations } from "@/hooks/queries/useArchivedConversations";
import { useReconnect } from "@/hooks/mutations/useReconnect";
import { useAuthStore } from "@/stores/auth.store";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { UpgradePrompt } from "@/components/ui/UpgradePrompt";
import { AppBackground } from "@/components/ui/AppBackground";

export default function ArchivedScreen() {
  const router = useRouter();
  const tier = useAuthStore((s) => s.user?.tier ?? "free");
  const { data: conversations, isLoading } = useArchivedConversations();
  const reconnectMutation = useReconnect();
  const [showUpgrade, setShowUpgrade] = useState(false);

  const handleReconnect = (conversationId: string) => {
    if (tier === "free") {
      setShowUpgrade(true);
      return;
    }
    reconnectMutation.mutate(conversationId, {
      onSuccess: (data) => {
        if (data.status === "reconnected") {
          router.push(`/(app)/chat/${conversationId}`);
        } else {
          Alert.alert(
            "Request Sent",
            "Your partner will be notified. The conversation will reactivate when they also agree."
          );
        }
      },
    });
  };

  return (
    <View style={styles.container}>
      <AppBackground />
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Avatar alias={item.partner.anonymousAlias} size={44} />
            <View style={styles.rowContent}>
              <Text style={styles.alias}>{item.partner.anonymousAlias}</Text>
              <Text style={styles.category}>{item.category}</Text>
            </View>
            <Button
              title="Reconnect"
              variant="outline"
              onPress={() => handleReconnect(item.id)}
              loading={reconnectMutation.isPending}
            />
          </View>
        )}
        contentContainerStyle={
          conversations?.length === 0 ? styles.emptyContainer : undefined
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {isLoading ? "Loading..." : "No archived conversations"}
            </Text>
          </View>
        }
      />

      <UpgradePrompt
        visible={showUpgrade}
        requiredTier="premium"
        featureName="Reconnect"
        onDismiss={() => setShowUpgrade(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  rowContent: {
    flex: 1,
    marginLeft: 12,
  },
  alias: {
    ...typography.body,
    fontFamily: "Inter_600SemiBold",
    color: colors.text,
  },
  category: {
    ...typography.caption,
    color: colors.textSecondary,
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
