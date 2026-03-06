import React, { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { View, TouchableOpacity, Text, StyleSheet, Dimensions } from "react-native";
import { Audio } from "expo-av";
import { File, Paths } from "expo-file-system";
import Svg, { Path, Rect } from "react-native-svg";
import { colors } from "@/theme/colors";

function PlayIcon({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M8 5v14l11-7L8 5z" fill={color} />
    </Svg>
  );
}

function PauseIcon({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="6" y="4" width="4" height="16" rx="1" fill={color} />
      <Rect x="14" y="4" width="4" height="16" rx="1" fill={color} />
    </Svg>
  );
}

interface VoiceMessageBubbleProps {
  content: string; // base64 audio
  durationMs: number;
  isMine: boolean;
  sentAt: string;
  deliveryStatus?: string;
  waveform?: number[];
}

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

const statusIcons: Record<string, string> = {
  sending: "\u2022",
  sent: "\u2713",
  delivered: "\u2713\u2713",
  read: "\u2713\u2713",
};

export function VoiceMessageBubble({
  content,
  durationMs,
  isMine,
  sentAt,
  deliveryStatus,
  waveform,
}: VoiceMessageBubbleProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const soundRef = useRef<Audio.Sound | null>(null);

  const time = new Date(sentAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, []);

  const handlePlay = useCallback(async () => {
    if (isPlaying && soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
      setIsPlaying(false);
      setProgress(0);
      return;
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      // Write base64 to a temp file for AVPlayer playback
      const tmpFile = new File(Paths.cache, `voice_${Date.now()}.m4a`);
      const bytes = Uint8Array.from(atob(content), (c) => c.charCodeAt(0));
      tmpFile.write(bytes);

      const { sound } = await Audio.Sound.createAsync(
        { uri: tmpFile.uri },
        { shouldPlay: true },
        (status) => {
          if (!status.isLoaded) return;
          if (status.durationMillis) {
            setProgress(status.positionMillis / status.durationMillis);
          }
          if (status.didJustFinish) {
            setIsPlaying(false);
            setProgress(0);
            sound.unloadAsync();
            soundRef.current = null;
            try { tmpFile.delete(); } catch {}
          }
        }
      );

      soundRef.current = sound;
      setIsPlaying(true);
    } catch (err) {
      console.error("Voice playback error:", err);
      setIsPlaying(false);
    }
  }, [content, isPlaying]);

  // Scale bubble width based on duration: 2s → 45%, 60s → 85% of screen
  const screenWidth = Dimensions.get("window").width;
  const durationSec = Math.max(durationMs / 1000, 1);
  const minPct = 0.45;
  const maxPct = 0.85;
  const pct = Math.min(minPct + ((durationSec - 1) / 59) * (maxPct - minPct), maxPct);
  const bubbleWidth = Math.round(screenWidth * pct);

  // Scale number of bars based on bubble width — pack them tightly
  // Each bar is 3px wide + 2px gap = 5px per bar
  const barCount = useMemo(() => {
    const availableWidth = bubbleWidth - 36 - 10 - 40 - 24; // play btn, gaps, duration text, padding
    return Math.max(Math.floor(availableWidth / 5), 12);
  }, [bubbleWidth]);

  // Downsample waveform to bar count, or generate fallback
  const barHeights = useMemo(() => {
    const maxH = 28;
    const minH = 4;

    if (waveform && waveform.length > 0) {
      // Downsample: split waveform into barCount buckets, take max of each
      const result: number[] = [];
      const step = waveform.length / barCount;
      for (let i = 0; i < barCount; i++) {
        const start = Math.floor(i * step);
        const end = Math.floor((i + 1) * step);
        let max = 0;
        for (let j = start; j < end && j < waveform.length; j++) {
          if (waveform[j] > max) max = waveform[j];
        }
        result.push(minH + max * (maxH - minH));
      }
      return result;
    }

    // Fallback: fake waveform for older messages without data
    return Array.from({ length: barCount }, (_, i) => {
      return minH + Math.abs(Math.sin(i * 1.2 + 1.5)) * (maxH - minH) * 0.7;
    });
  }, [waveform, barCount]);

  return (
    <View style={[styles.wrapper, isMine && styles.wrapperMine, { width: bubbleWidth }]}>
      <View style={[styles.bubble, isMine ? styles.mine : styles.theirs]}>
        <View style={styles.row}>
          <TouchableOpacity onPress={handlePlay} style={styles.playButton}>
            {isPlaying ? (
              <PauseIcon color={isMine ? colors.textInverse : colors.primary} />
            ) : (
              <PlayIcon color={isMine ? colors.textInverse : colors.primary} />
            )}
          </TouchableOpacity>

          <View style={styles.waveContainer}>
            <View style={styles.bars}>
              {barHeights.map((h, i) => {
                const filled = i / barHeights.length <= progress;
                return (
                  <View
                    key={i}
                    style={{
                      width: 3,
                      height: h,
                      borderRadius: 1.5,
                      backgroundColor: filled
                        ? isMine ? colors.textInverse : colors.primary
                        : isMine ? "rgba(255,255,255,0.35)" : "rgba(41,182,246,0.3)",
                    }}
                  />
                );
              })}
            </View>
          </View>

          <Text style={[styles.duration, isMine && styles.durationMine]}>
            {formatDuration(durationMs)}
          </Text>
        </View>
      </View>
      <View style={[styles.meta, isMine && styles.metaMine]}>
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
    alignSelf: "flex-start",
  },
  wrapperMine: {
    alignSelf: "flex-end",
  },
  bubble: {
    paddingHorizontal: 12,
    paddingVertical: 10,
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  waveContainer: {
    flex: 1,
  },
  bars: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    height: 32,
  },
  duration: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: colors.textSecondary,
    minWidth: 32,
  },
  durationMine: {
    color: "rgba(255,255,255,0.8)",
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
