import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { AppBackground } from "@/components/ui/AppBackground";
import { Button } from "@/components/ui/Button";
import { isReviewBuild, redeemReviewAccess, ensureReviewDemo } from "@/api/review.api";
import { queryClient } from "@/providers/QueryProvider";
import { queryKeys } from "@/lib/query-keys";

/**
 * App Review Access — shown only in a review build. The reviewer enters the
 * access code from App Review notes; on success the server grants access and a
 * scripted demo conversation appears in the Inbox. The code is only ever sent
 * over HTTPS; it is never stored in the app binary.
 */
export default function ReviewAccessScreen() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Defence in depth: a non-review build should never reach this route, but if
  // it does, show nothing actionable.
  if (!isReviewBuild) {
    return (
      <View style={styles.container}>
        <AppBackground />
        <Text style={styles.body}>Not available.</Text>
      </View>
    );
  }

  async function handleRedeem() {
    if (busy || code.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await redeemReviewAccess(code.trim());
      const conversationId = await ensureReviewDemo();
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      Alert.alert(
        "Review access granted",
        conversationId
          ? "A scripted demo conversation is now in your Inbox."
          : "Access granted. Open the Inbox to see the demo conversation.",
        [{ text: "OK", onPress: () => router.replace("/(app)/(tabs)") }],
      );
    } catch {
      setError("That code was not accepted. Check the code in App Review notes and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <AppBackground />
      <View style={styles.content}>
        <Text style={styles.title} accessibilityRole="header">App Review Access</Text>
        <Text style={styles.body}>
          Enter the review access code from the App Review notes to load a
          scripted demo conversation. This screen only appears in review builds.
        </Text>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={setCode}
          placeholder="Access code"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          editable={!busy}
          accessibilityLabel="Review access code"
        />
        {error && <Text style={styles.error}>{error}</Text>}
        {busy ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
        ) : (
          <Button title="Redeem" onPress={handleRedeem} style={{ marginTop: 16 }} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: "center", padding: 24 },
  title: { ...typography.h1, color: colors.text, marginBottom: 12 },
  body: { ...typography.body, color: colors.textSecondary, marginBottom: 20 },
  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  error: { ...typography.bodySmall, color: colors.error, marginTop: 12 },
});
