import React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { colors } from "@/theme/colors";

interface PromptInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  loading: boolean;
}

const MAX_LENGTH = 500;

export function PromptInput({
  value,
  onChangeText,
  onSubmit,
  loading,
}: PromptInputProps) {
  const charCount = value.length;
  const isOverWarning = charCount > 450;
  const canSubmit = value.trim().length >= 10 && !loading;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>What's weighing on you?</Text>
      <Text style={styles.subtext}>
        Share what's on your mind, and we'll find someone who understands.
      </Text>

      <View style={styles.inputCard}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder="I've been feeling..."
          placeholderTextColor={colors.textTertiary}
          multiline
          maxLength={MAX_LENGTH}
          textAlignVertical="top"
        />
        <Text
          style={[styles.charCount, isOverWarning && styles.charCountWarning]}
        >
          {charCount}/{MAX_LENGTH}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.button, !canSubmit && styles.buttonDisabled]}
        onPress={onSubmit}
        disabled={!canSubmit}
        activeOpacity={0.7}
      >
        {loading ? (
          <ActivityIndicator color={colors.textInverse} />
        ) : (
          <Text style={styles.buttonText}>Find my match</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  heading: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: colors.text,
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  subtext: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  inputCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    minHeight: 140,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  input: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: colors.text,
    lineHeight: 22,
    minHeight: 100,
    padding: 0,
  },
  charCount: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: colors.textTertiary,
    textAlign: "right",
    marginTop: 8,
  },
  charCountWarning: {
    color: colors.warning,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 25,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: colors.textInverse,
  },
});
