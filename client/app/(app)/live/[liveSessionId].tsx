import React from "react";
import { View, FlatList, Text, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { useAuthStore } from "@/stores/auth.store";
import { useLiveSession } from "@/hooks/socket/useLiveSession";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { ChatInput } from "@/components/chat/ChatInput";
import { CrisisAlert } from "@/components/chat/CrisisAlert";
import { Button } from "@/components/ui/Button";
import { AppBackground } from "@/components/ui/AppBackground";

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function LiveSessionScreen() {
  const { liveSessionId, conversationId, durationMs } = useLocalSearchParams<{
    liveSessionId: string;
    conversationId: string;
    durationMs: string;
  }>();
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const tier = useAuthStore((s) => s.user?.tier ?? "free");

  const {
    messages,
    timeRemaining,
    isEnded,
    extendRequested,
    crisisData,
    clearCrisis,
    sendMessage,
    requestExtend,
    endSession,
  } = useLiveSession(
    liveSessionId!,
    conversationId!,
    parseInt(durationMs ?? "1200000", 10)
  );

  const isLow = timeRemaining < 60_000;
  const canExtend = tier !== "free";

  if (isEnded) {
    return (
      <SafeAreaView style={styles.endedContainer}>
        <AppBackground />
        <Text style={styles.endedTitle}>Session Ended</Text>
        <Text style={styles.endedSubtitle}>
          You can continue chatting asynchronously.
        </Text>
        <Button
          title="Back to Chat"
          onPress={() => router.back()}
          style={{ marginTop: 24 }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <AppBackground />
      <View style={[styles.timerBar, isLow && styles.timerBarLow]}>
        <Text style={[styles.timerText, isLow && styles.timerTextLow]}>
          {formatTime(timeRemaining)}
        </Text>
        <View style={styles.timerActions}>
          {extendRequested && (
            <Text style={styles.extendRequest}>Partner wants to extend</Text>
          )}
          {canExtend && (
            <Button title="Extend" variant="outline" onPress={requestExtend} />
          )}
          <Button title="End" variant="danger" onPress={endSession} />
        </View>
      </View>

      <FlatList
        data={[...messages].reverse()}
        keyExtractor={(_, i) => `live-${i}`}
        renderItem={({ item }) => (
          <MessageBubble
            content={item.content}
            sentAt={item.sentAt}
            isMine={item.senderId === userId}
          />
        )}
        inverted
        contentContainerStyle={styles.messageList}
      />

      <ChatInput
        onSend={sendMessage}
        placeholder="Live message..."
      />

      {crisisData && (
        <CrisisAlert
          visible={!!crisisData}
          resources={crisisData.resources}
          onDismiss={clearCrisis}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  timerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  timerBarLow: {
    backgroundColor: colors.error + "15",
  },
  timerText: {
    ...typography.h2,
    color: colors.primary,
  },
  timerTextLow: {
    color: colors.error,
  },
  timerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  extendRequest: {
    ...typography.caption,
    fontFamily: "Inter_600SemiBold",
    color: colors.primary,
  },
  messageList: {
    paddingVertical: 8,
  },
  endedContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  endedTitle: {
    ...typography.h1,
    color: colors.text,
  },
  endedSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 8,
    textAlign: "center",
  },
});
