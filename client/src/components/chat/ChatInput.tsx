import React, { useState, useRef, useEffect } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors } from "@/theme/colors";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";

function MicIcon({ color = colors.primary, size = 20 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"
        fill={color}
      />
      <Path
        d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"
        fill={color}
      />
    </Svg>
  );
}

interface ChatInputProps {
  onSend: (content: string) => void;
  onSendVoice?: (data: { audio: string; durationMs: number; waveform: number[] }) => void;
  onTyping?: () => void;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  onSendVoice,
  onTyping,
  placeholder = "Send message...",
}: ChatInputProps) {
  const [text, setText] = useState("");
  const lastTypingRef = useRef(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const { isRecording, durationSec, start, stop, cancel } = useVoiceRecorder();

  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isRecording, pulseAnim]);

  // Auto-stop at 60s
  useEffect(() => {
    if (durationSec >= 60) {
      handleStopRecording();
    }
  }, [durationSec]);

  const handleChangeText = (value: string) => {
    setText(value);
    const now = Date.now();
    if (onTyping && now - lastTypingRef.current > 2000) {
      lastTypingRef.current = now;
      onTyping();
    }
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  };

  const handleStartRecording = async () => {
    await start();
  };

  const handleStopRecording = async () => {
    const result = await stop();
    if (result && onSendVoice) {
      onSendVoice({ audio: result.base64, durationMs: result.durationMs, waveform: result.waveform });
    }
  };

  const handleCancelRecording = async () => {
    await cancel();
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const hasText = text.trim().length > 0;

  if (isRecording) {
    return (
      <View style={styles.container}>
        <View style={styles.recordingWrapper}>
          <TouchableOpacity onPress={handleCancelRecording} style={styles.cancelButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>

          <View style={styles.recordingCenter}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingTimer}>{formatTime(durationSec)}</Text>
          </View>

          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity onPress={handleStopRecording} style={styles.sendButton}>
              <Text style={styles.sendArrow}>&#x27A4;</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.inputWrapper}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={handleChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          multiline
          maxLength={5000}
        />

        {hasText ? (
          <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
            <Text style={styles.sendArrow}>&#x27A4;</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.micButton}
            onPress={handleStartRecording}
          >
            <MicIcon color={colors.primary} size={20} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: colors.surface,
    borderRadius: 25,
    paddingLeft: 18,
    paddingRight: 5,
    paddingVertical: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: colors.text,
    paddingVertical: 8,
    maxHeight: 100,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendArrow: {
    fontSize: 18,
    color: colors.textInverse,
  },
  micButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primaryLight + "30",
    alignItems: "center",
    justifyContent: "center",
  },
  recordingWrapper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: 25,
    paddingLeft: 16,
    paddingRight: 5,
    paddingVertical: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  cancelText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: colors.error,
  },
  recordingCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.error,
  },
  recordingTimer: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: colors.text,
  },
});
