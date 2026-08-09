import React, { useMemo, useState } from "react";
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
import { useConversationsStore } from "@/stores/conversations.store";
import { AppBackground } from "@/components/ui/AppBackground";
import type { AnalyseResult } from "@/types/api";

// Exact server enum values (src/matching/compatibility.ts). "either"/"mutual"
// are real neutral choices shown selected by default — never silently faked.
const MATCH_PROFILE_VERSION = 1;
type Intent = "seek_support" | "offer_support" | "mutual";
type InteractionStyle = "one_off" | "ongoing" | "either";
type AdviceChoice = "listen" | "ideas" | "either";

function SegmentedRow<T extends string>({
  label, value, options, onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.prefRow}>
      <Text style={styles.prefLabel}>{label}</Text>
      <View style={styles.segments}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <TouchableOpacity
              key={o.value}
              style={[styles.segment, active && styles.segmentActive]}
              onPress={() => onChange(o.value)}
              activeOpacity={0.7}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function ConfirmScreen() {
  const router = useRouter();
  const { analysis } = useLocalSearchParams<{ analysis: string }>();
  const joinMatch = useJoinMatch();
  const setIsSearching = useConversationsStore((s) => s.setIsSearching);
  const [searching, setSearching] = useState(false);

  // Neutral defaults (explicitly shown), preserved across a join retry.
  const [intent, setIntent] = useState<Intent>("mutual");
  const [style, setStyle] = useState<InteractionStyle>("either");
  const [advice, setAdvice] = useState<AdviceChoice>("either");

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
    // Build the versioned MatchProfile with exact server enums. "either" advice
    // → omit wantsAdvice (no fabricated preference). Server validation is
    // authoritative and rejects unknown values.
    const profile: Record<string, unknown> = {
      version: MATCH_PROFILE_VERSION,
      intent,
      interactionStyle: style,
    };
    if (advice !== "either") profile.wantsAdvice = advice === "ideas";

    joinMatch.mutate(
      {
        category: "ai-prompt",
        keywords: result.keywords,
        matchContext: { ...(result as unknown as Record<string, unknown>), profile },
      },
      {
        onSuccess: () => {
          setIsSearching(true);
          setSearching(true);
        },
      }
    );
  };

  const handleDismiss = () => {
    router.replace("/(app)/(tabs)");
  };

  if (searching) {
    return (
      <SafeAreaView style={styles.container}>
        <AppBackground />
        <View style={styles.searchingContainer}>
          <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 24 }} />
          <Text style={styles.searchingHeading}>Finding your match</Text>
          <Text style={styles.searchingSubtext}>
            We're looking for someone who understands what you're going through. We'll notify you as soon as we find a match.
          </Text>
          <TouchableOpacity
            style={styles.dismissButton}
            onPress={handleDismiss}
            activeOpacity={0.7}
          >
            <Text style={styles.dismissButtonText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

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

        <Text style={styles.matchNote}>
          A few quick preferences help us match you better. Peers support each
          other — no one here gives professional advice.
        </Text>

        <View style={styles.prefCard}>
          <SegmentedRow
            label="Right now I'm…"
            value={intent}
            onChange={setIntent}
            options={[
              { value: "seek_support", label: "Looking for support" },
              { value: "mutual", label: "Both" },
              { value: "offer_support", label: "Able to support" },
            ]}
          />
          <SegmentedRow
            label="I'd like…"
            value={style}
            onChange={setStyle}
            options={[
              { value: "one_off", label: "A one-off chat" },
              { value: "either", label: "Either" },
              { value: "ongoing", label: "An ongoing connection" },
            ]}
          />
          <SegmentedRow
            label="I'm mostly…"
            value={advice}
            onChange={setAdvice}
            options={[
              { value: "listen", label: "Here to listen" },
              { value: "either", label: "Either" },
              { value: "ideas", label: "Open to shared ideas" },
            ]}
          />
        </View>
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
  searchingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  searchingHeading: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: colors.primary,
    marginBottom: 12,
    textAlign: "center",
  },
  searchingSubtext: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
  dismissButton: {
    backgroundColor: colors.primary,
    borderRadius: 25,
    paddingVertical: 14,
    paddingHorizontal: 48,
  },
  dismissButtonText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: colors.textInverse,
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
  matchNote: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 8,
  },
  prefCard: {
    width: "100%",
    marginTop: 8,
  },
  prefRow: {
    marginBottom: 16,
  },
  prefLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: colors.text,
    marginBottom: 8,
  },
  segments: {
    flexDirection: "row",
    gap: 6,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  segmentText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: colors.textSecondary,
    textAlign: "center",
  },
  segmentTextActive: {
    color: colors.textInverse,
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
