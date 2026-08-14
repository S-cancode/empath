import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { colors } from "@/theme/colors";
import { VoiceMessageBubble } from "./VoiceMessageBubble";
import { resolveDisplay } from "./translationDisplay";

interface MessageBubbleProps {
  content: string;
  sentAt: string;
  isMine: boolean;
  senderAlias?: string;
  deliveryStatus?: "sending" | "sent" | "delivered" | "read";
  messageType?: "text" | "voice";
  voiceDurationMs?: number;
  waveform?: number[];
  onLongPress?: () => void;
  // Translation metadata (forwarded from the server via getMessages / socket)
  originalContent?: string;
  translated?: boolean;
  sourceLanguage?: string | null;
}

const statusIcons: Record<string, string> = {
  sending: "\u2022",
  sent: "\u2713",
  delivered: "\u2713\u2713",
  read: "\u2713\u2713",
};

export function MessageBubble({
  content,
  sentAt,
  isMine,
  senderAlias,
  deliveryStatus,
  messageType,
  voiceDurationMs,
  waveform,
  onLongPress,
  originalContent,
  translated,
  sourceLanguage,
}: MessageBubbleProps) {
  const [showOriginal, setShowOriginal] = useState(false);

  if (messageType === "voice") {
    return (
      <VoiceMessageBubble
        content={content}
        durationMs={voiceDurationMs ?? 0}
        isMine={isMine}
        sentAt={sentAt}
        deliveryStatus={deliveryStatus}
        waveform={waveform}
        onLongPress={onLongPress}
      />
    );
  }

  const time = new Date(sentAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const display = resolveDisplay(
    { content, originalContent, translated, sourceLanguage },
    showOriginal,
  );

  return (
    <Pressable
      style={[styles.wrapper, isMine && styles.wrapperMine]}
      onPress={display.showToggle ? () => setShowOriginal((v) => !v) : undefined}
      onLongPress={onLongPress}
      delayLongPress={500}
    >
      <View style={[styles.bubble, isMine ? styles.mine : styles.theirs]}>
        <Text style={[styles.content, isMine ? styles.contentMine : styles.contentTheirs]}>
          {display.text}
        </Text>
      </View>
      <View style={[styles.meta, isMine && styles.metaMine]}>
        {senderAlias && !isMine && (
          <Text style={styles.senderName}>{senderAlias}</Text>
        )}
        <Text style={styles.time}>{time}</Text>
        {isMine && deliveryStatus && (
          <Text style={[styles.status, deliveryStatus === "read" && styles.statusRead]}>
            {" "}{statusIcons[deliveryStatus]}
          </Text>
        )}
      </View>
      {display.showToggle && display.toggleLabel && (
        <Text style={[styles.translateLabel, isMine && styles.translateLabelMine]}>
          {display.toggleLabel}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: 4,
    marginHorizontal: 16,
    maxWidth: "75%",
    alignSelf: "flex-start",
  },
  wrapperMine: {
    alignSelf: "flex-end",
  },
  bubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 22,
  },
  mine: {
    backgroundColor: colors.bubble.mine,
    borderBottomRightRadius: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  theirs: {
    backgroundColor: colors.bubble.theirs,
    borderBottomLeftRadius: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  content: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
  },
  contentMine: {
    color: colors.bubble.mineText,
  },
  contentTheirs: {
    color: colors.bubble.theirsText,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    paddingHorizontal: 4,
  },
  metaMine: {
    justifyContent: "flex-end",
  },
  senderName: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: colors.textTertiary,
    marginRight: 6,
  },
  time: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: colors.textTertiary,
  },
  status: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: colors.textTertiary,
  },
  statusRead: {
    color: colors.primary,
  },
  translateLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: colors.textTertiary,
    marginTop: 2,
    paddingHorizontal: 4,
    fontStyle: "italic",
  },
  translateLabelMine: {
    textAlign: "right",
  },
});
