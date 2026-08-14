import React, { useMemo, useCallback, useEffect, useState } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { colors } from "@/theme/colors";
import { useAuthStore } from "@/stores/auth.store";
import { useConversationsStore } from "@/stores/conversations.store";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { resolveVoiceAck, VOICE_SEND_TIMEOUT_MS } from "@/lib/voice-send";
import { useMessages } from "@/hooks/queries/useMessages";
import { useSendMessage } from "@/hooks/mutations/useSendMessage";
import { useReportUser } from "@/hooks/mutations/useReportUser";
import { useBlockUser } from "@/hooks/mutations/useBlockUser";
import { useConversations } from "@/hooks/queries/useConversations";
import { useConversationSocket } from "@/hooks/socket/useConversationSocket";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { languageLabel } from "@/components/chat/translationDisplay";
import { ChatInput } from "@/components/chat/ChatInput";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { CrisisAlert } from "@/components/chat/CrisisAlert";
import { ReportSheet } from "@/components/chat/ReportSheet";
import { Avatar } from "@/components/ui/Avatar";
import { AppBackground } from "@/components/ui/AppBackground";
import { useSocket } from "@/providers/SocketProvider";
import type { Message } from "@/types/api";

const EMPTY_ARRAY: never[] = [];

function formatDateLabel(sentAt: string): string {
  const date = new Date(sentAt);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - msgDay.getTime()) / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: "long" });
  }
  return date.toLocaleDateString([], {
    day: "numeric",
    month: "long",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

export default function ChatScreen() {
  const { conversationId, openReport } = useLocalSearchParams<{
    conversationId: string;
    openReport?: string;
  }>();
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);

  const { data: conversations } = useConversations();
  const conversation = conversations?.find((c) => c.id === conversationId);
  const partnerAlias = conversation?.partner.anonymousAlias ?? "Partner";

  const nickname = useConversationsStore((s) => s.nicknames[conversationId!]);
  const setNickname = useConversationsStore((s) => s.setNickname);
  const displayName = nickname || partnerAlias;

  const { socket } = useSocket();
  const queryClient = useQueryClient();
  const { data, fetchNextPage, hasNextPage } = useMessages(conversationId!);
  const sendMessage = useSendMessage(conversationId!);
  const reportMutation = useReportUser();
  const blockMutation = useBlockUser();
  const [reportVisible, setReportVisible] = useState(false);
  const [reportedMessageId, setReportedMessageId] = useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<"idle" | "processing" | "sent">("idle");
  const clearUnread = useConversationsStore((s) => s.clearUnread);
  const setActiveConversation = useConversationsStore((s) => s.setActiveConversation);
  const optimisticMessages = useConversationsStore(
    (s) => s.optimisticMessages[conversationId!] ?? EMPTY_ARRAY
  );

  // Track which conversation is active so global listener skips unread increment
  // and backend suppresses push notifications for this conversation
  useEffect(() => {
    if (conversationId) {
      clearUnread(conversationId);
      setActiveConversation(conversationId);
      socket?.emit("push:active", { conversationId });
    }
    return () => {
      setActiveConversation(null);
      socket?.emit("push:inactive");
    };
  }, [conversationId, clearUnread, setActiveConversation, socket]);

  // Auto-open report sheet when navigating from post-session screen
  useEffect(() => {
    if (openReport === "true") {
      setReportVisible(true);
    }
  }, [openReport]);

  const {
    isOnline,
    isTyping,
    crisisData,
    clearCrisis,
    emitTyping,
  } = useConversationSocket(conversationId!);

  const messagesExpired =
    data?.pages != null &&
    data.pages.flat().length === 0 &&
    conversation?.lastMessageAt != null;

  const messages = useMemo(() => {
    const serverMessages: Message[] = data?.pages.flatMap((p) => p) ?? [];
    // Only show optimistic messages that haven't been persisted yet.
    // Match by content + senderId since optimistic IDs differ from server IDs.
    const optimistic = optimisticMessages.filter(
      (om) =>
        om.deliveryStatus === "sending" &&
        !serverMessages.some(
          (sm) => sm.senderId === om.senderId && sm.content === om.content
        )
    );
    return [
      ...optimistic.map((om): Message => ({
        id: om.id,
        senderId: om.senderId,
        content: om.content,
        sentAt: om.sentAt,
        deliveryStatus: "sent" as const,
        // Optimistic sends are always plain text; declaring the full Message
        // shape keeps the merged list a single Message[] type.
        messageType: "text" as const,
      } satisfies Message)),
      ...serverMessages,
    ].sort(
      (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()
    );
  }, [data, optimisticMessages]);

  const handleSend = useCallback(
    (content: string) => sendMessage.mutate(content),
    [sendMessage]
  );

  const voiceSendingRef = React.useRef(false);

  // Always release the send lock when leaving the screen or losing the socket,
  // so a voice send can never stay stuck across navigation/disconnect.
  useEffect(() => {
    return () => { voiceSendingRef.current = false; };
  }, []);
  useEffect(() => {
    if (!socket) return;
    const onDisconnect = () => {
      if (voiceSendingRef.current) {
        voiceSendingRef.current = false;
        setVoiceStatus("idle");
      }
    };
    socket.on("disconnect", onDisconnect);
    return () => { socket.off("disconnect", onDisconnect); };
  }, [socket]);

  const handleSendVoice = useCallback(
    (voiceData: { audio: string; durationMs: number; waveform: number[] }) => {
      if (!socket || voiceSendingRef.current) return; // prevent duplicate sends
      voiceSendingRef.current = true;
      setVoiceStatus("processing");

      // .timeout() gives us an (err, res) ack: a timeout/transport error is
      // treated as retryable, never as success.
      socket.timeout(VOICE_SEND_TIMEOUT_MS).emit(
        "conversation:voice-note",
        {
          conversationId: conversationId!,
          audio: voiceData.audio,
          durationMs: voiceData.durationMs,
          waveform: voiceData.waveform,
        },
        (err: unknown, res: { status?: string; message?: string }) => {
          voiceSendingRef.current = false;
          const outcome = resolveVoiceAck(err, res);
          if (outcome.state === "sent") {
            setVoiceStatus("sent");
            queryClient.invalidateQueries({ queryKey: queryKeys.messages(conversationId!) });
            queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
          } else {
            setVoiceStatus("idle");
            Alert.alert(
              outcome.state === "retry" ? "Couldn't send just now" : "Voice note not sent",
              outcome.message,
            );
          }
        },
      );
    },
    [socket, conversationId, queryClient]
  );

  const handleRename = () => {
    Alert.prompt(
      "Rename conversation",
      `Current name: ${displayName}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => setNickname(conversationId!, ""),
        },
        {
          text: "Save",
          onPress: (value?: string) => {
            if (value?.trim()) setNickname(conversationId!, value.trim());
          },
        },
      ],
      "plain-text",
      nickname || ""
    );
  };

  const showActionSheet = () => {
    Alert.alert(displayName, undefined, [
      { text: "Report User", onPress: () => { setReportedMessageId(null); setReportVisible(true); } },
      {
        text: "Block User",
        style: "destructive",
        onPress: handleBlock,
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handleReport = (reason: string, details?: string) => {
    if (!conversation) return;
    reportMutation.mutate(
      {
        conversationId: conversationId!,
        reportedUserId: conversation.partner.id,
        reason,
        details,
        // Present when the report was started from a specific message
        // (text or voice); lets moderators inspect the exact item.
        reportedMessageId: reportedMessageId ?? undefined,
      },
      {
        onSuccess: () => {
          setReportVisible(false);
          setReportedMessageId(null);
          Alert.alert(
            "Report Submitted",
            "Thank you. We have received your report and will review it within 24 hours. You will not be matched with this user again."
          );
        },
      }
    );
  };

  const handleBlock = () => {
    if (!conversation) return;
    Alert.alert(
      `Block ${displayName}?`,
      "You will never be matched with them again. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: () => {
            blockMutation.mutate(conversation.partner.id, {
              onSuccess: () => {
                router.back();
                setTimeout(() => {
                  Alert.alert("User blocked", "You will not be matched with them again.");
                }, 300);
              },
            });
          },
        },
      ]
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: "transparent" },
          headerShadowVisible: false,
          headerTitle: () => (
            <TouchableOpacity onPress={handleRename} activeOpacity={0.6}>
              <Text style={styles.headerName}>{displayName}</Text>
              <Text style={styles.headerHint}>tap to rename</Text>
            </TouchableOpacity>
          ),
          headerRight: () => (
            <View style={styles.headerRightRow}>
              <TouchableOpacity onPress={showActionSheet} style={styles.menuButton}>
                <Text style={styles.menuDots}>{"\u22EE"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={showActionSheet} style={styles.headerRight}>
                <Avatar alias={partnerAlias} size={34} />
                {isOnline && <View style={styles.headerOnline} />}
              </TouchableOpacity>
            </View>
          ),
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Text style={styles.backArrow}>&#x2190;</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
      >
        <View style={styles.container}>
          <AppBackground />

          {(() => {
            const first = messages.find(
              (m) => (m as Message).translated === true && (m as Message).sourceLanguage,
            ) as Message | undefined;
            if (!first) return null;
            return (
              <TouchableOpacity
                style={styles.translateBanner}
                activeOpacity={0.7}
                onPress={() => router.push("/(app)/translation-settings" as any)}
              >
                <Text style={styles.translateBannerText}>
                  Auto-translating from {languageLabel(first.sourceLanguage)}
                </Text>
              </TouchableOpacity>
            );
          })()}

          <FlatList
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => {
              // In an inverted list, index 0 is newest. Show a date header
              // above a message when it's the first of its day (i.e. the next
              // item in the array is from a different/older day, or this is the
              // last item — the oldest message).
              const currDate = new Date(item.sentAt).toDateString();
              const nextItem = messages[index + 1];
              const showDate =
                !nextItem ||
                new Date(nextItem.sentAt).toDateString() !== currDate;

              return (
                <>
                  <MessageBubble
                    content={item.content}
                    sentAt={item.sentAt}
                    isMine={item.senderId === userId}
                    deliveryStatus={item.deliveryStatus}
                    messageType={item.messageType}
                    voiceDurationMs={item.voiceDurationMs}
                    waveform={item.waveform}
                    originalContent={item.originalContent}
                    translated={item.translated}
                    sourceLanguage={item.sourceLanguage}
                    onLongPress={
                      item.senderId !== userId
                        ? () => {
                            Alert.alert(
                              "Message Options",
                              undefined,
                              [
                                { text: "Report This Message", onPress: () => { setReportedMessageId(item.id); setReportVisible(true); } },
                                { text: "Cancel", style: "cancel" },
                              ]
                            );
                          }
                        : undefined
                    }
                  />
                  {showDate && (
                    <View style={styles.dateSeparator}>
                      <View style={styles.dateLine} />
                      <Text style={styles.dateText}>{formatDateLabel(item.sentAt)}</Text>
                      <View style={styles.dateLine} />
                    </View>
                  )}
                </>
              );
            }}
            inverted
            onEndReached={() => hasNextPage && fetchNextPage()}
            onEndReachedThreshold={0.5}
            contentContainerStyle={styles.messageList}
            keyboardShouldPersistTaps="handled"
            ListFooterComponent={
              messagesExpired ? (
                <View style={styles.retentionNotice}>
                  <Text style={styles.retentionText}>
                    Previous messages were automatically removed after 7 days.
                  </Text>
                </View>
              ) : null
            }
          />

          {isTyping && <TypingIndicator />}

          {voiceStatus === "processing" && (
            <View style={styles.voiceStatusBar}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.voiceStatusText}>Checking and sending your voice note…</Text>
            </View>
          )}

          <ChatInput onSend={handleSend} onSendVoice={handleSendVoice} onTyping={emitTyping} />

          {crisisData && (
            <CrisisAlert
              visible={!!crisisData}
              resources={crisisData.resources}
              onDismiss={clearCrisis}
            />
          )}

          <ReportSheet
            visible={reportVisible}
            partnerName={displayName}
            onDismiss={() => setReportVisible(false)}
            onSubmit={handleReport}
            loading={reportMutation.isPending}
          />
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  voiceStatusBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  voiceStatusText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  container: {
    flex: 1,
  },
  headerName: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: colors.text,
    textAlign: "center",
  },
  headerHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: colors.textTertiary,
    textAlign: "center",
  },
  headerRightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  menuButton: {
    padding: 4,
  },
  menuDots: {
    fontSize: 20,
    color: colors.text,
    fontWeight: "bold",
  },
  headerRight: {
    position: "relative",
    marginRight: 4,
  },
  headerOnline: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.online,
    borderWidth: 2,
    borderColor: colors.background,
  },
  backButton: {
    padding: 4,
    marginLeft: 4,
  },
  backArrow: {
    fontSize: 24,
    color: colors.text,
  },
  messageList: {
    paddingVertical: 8,
  },
  dateSeparator: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 12,
    marginHorizontal: 16,
  },
  dateLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.textTertiary + "60",
  },
  dateText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: colors.textTertiary,
    marginHorizontal: 12,
  },
  retentionNotice: {
    marginHorizontal: 32,
    marginVertical: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.info + "18",
    borderRadius: 10,
    alignItems: "center",
  },
  retentionText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
  translateBanner: {
    backgroundColor: colors.primary + "18",
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  translateBannerText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: colors.primaryDark,
  },
});
