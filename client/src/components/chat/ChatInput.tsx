import React, { useState, useRef } from "react";
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from "react-native";
import { colors } from "@/theme/colors";

interface ChatInputProps {
  onSend: (content: string) => void;
  onTyping?: () => void;
  placeholder?: string;
}

// Text-only for v1. Voice notes are disabled (no audio moderation parity).
export function ChatInput({
  onSend,
  onTyping,
  placeholder = "Send message...",
}: ChatInputProps) {
  const [text, setText] = useState("");
  const lastTypingRef = useRef(0);

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

  const hasText = text.trim().length > 0;

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

        <TouchableOpacity
          style={[styles.sendButton, !hasText && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!hasText}
        >
          <Text style={styles.sendArrow}>&#x27A4;</Text>
        </TouchableOpacity>
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
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
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
  sendButtonDisabled: {
    backgroundColor: colors.primaryLight + "60",
  },
  sendArrow: {
    fontSize: 18,
    color: colors.textInverse,
  },
});
