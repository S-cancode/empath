import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/theme/colors";
import { VoiceMessageBubble } from "./VoiceMessageBubble";

interface MessageBubbleProps {
  content: string;
  sentAt: string;
  isMine: boolean;
  senderAlias?: string;
  deliveryStatus?: "sending" | "sent" | "delivered" | "read";
  messageType?: "text" | "voice";
  voiceDurationMs?: number;
  waveform?: number[];
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
}: MessageBubbleProps) {
  if (messageType === "voice") {
    return (
      <VoiceMessageBubble
        content={content}
        durationMs={voiceDurationMs ?? 0}
        isMine={isMine}
        sentAt={sentAt}
        deliveryStatus={deliveryStatus}
        waveform={waveform}
      />
    );
  }

  const time = new Date(sentAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <View style={[styles.wrapper, isMine && styles.wrapperMine]}>
      <View style={[styles.bubble, isMine ? styles.mine : styles.theirs]}>
        <Text style={[styles.content, isMine ? styles.contentMine : styles.contentTheirs]}>
          {content}
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
    </View>
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
    borderRadius: 20,
  },
  mine: {
    backgroundColor: colors.bubble.mine,
    borderBottomRightRadius: 6,
  },
  theirs: {
    backgroundColor: colors.bubble.theirs,
    borderBottomLeftRadius: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
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
});
