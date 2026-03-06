import React, { useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/theme/colors";
import { useJoinMatch } from "@/hooks/mutations/useJoinMatch";
import { AppBackground } from "@/components/ui/AppBackground";
import type { AnalyseResult } from "@/types/api";

export default function ConfirmScreen() {
  const router = useRouter();
  const { analysis } = useLocalSearchParams<{ analysis: string }>();
  const joinMatch = useJoinMatch();

  const result: AnalyseResult | null = useMemo(() => {
    try {
      return analysis ? JSON.parse(analysis) : null;
    } catch {
      return null;
    }
  }, [analysis]);

  if (!result) {
    router.back();
    return null;
  }

  const handleFindMatch = () => {
    joinMatch.mutate(
      {
        category: "ai-prompt",
        keywords: result.keywords,
        intensity: result.intensity,
        matchContext: result as unknown as Record<string, unknown>,
      },
      {
        onSuccess: () => {
          router.replace("/(app)/queue/ai-prompt");
        },
      }
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <AppBackground />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.emoji}>&#x1F49B;</Text>

        <Text style={styles.heading}>We hear you</Text>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryText}>{result.summary}</Text>
        </View>

        {result.keywords.length > 0 && (
          <View style={styles.keywordsRow}>
            {result.keywords.map((kw) => (
              <View key={kw} style={styles.keywordChip}>
                <Text style={styles.keywordText}>{kw}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.matchNote}>
          We'll find someone who understands what you're going through.
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.matchButton, joinMatch.isPending && styles.matchButtonDisabled]}
          onPress={handleFindMatch}
          disabled={joinMatch.isPending}
          activeOpacity={0.7}
        >
          {joinMatch.isPending ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.matchButtonText}>Find my match</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backLink}
          onPress={() => router.back()}
        >
          <Text style={styles.backLinkText}>Go back & edit</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    alignItems: "center",
  },
  emoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  heading: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: colors.text,
    marginBottom: 20,
    letterSpacing: -0.3,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 20,
  },
  summaryText: {
    fontSize: 17,
    fontFamily: "Inter_400Regular",
    lineHeight: 26,
    color: colors.text,
    textAlign: "center",
  },
  keywordsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
    marginBottom: 20,
  },
  keywordChip: {
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  keywordText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: colors.textSecondary,
  },
  matchNote: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 8,
  },
  footer: {
    padding: 24,
  },
  matchButton: {
    backgroundColor: colors.primary,
    borderRadius: 25,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  matchButtonDisabled: {
    opacity: 0.5,
  },
  matchButtonText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: colors.textInverse,
  },
  backLink: {
    alignItems: "center",
    paddingVertical: 14,
  },
  backLinkText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: colors.primary,
  },
});
