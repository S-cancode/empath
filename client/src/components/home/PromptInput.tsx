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
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  heading: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: colors.text,
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  subtext: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: 20,
  },
  inputCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 18,
    minHeight: 150,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: colors.text,
    lineHeight: 24,
    minHeight: 110,
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
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.4,
    shadowOpacity: 0,
  },
  buttonText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: colors.textInverse,
    letterSpacing: 0.3,
  },
});
