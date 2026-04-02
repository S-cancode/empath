import React, { useState, useEffect } from "react";
import { View, ScrollView, StyleSheet, Text, Keyboard, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { useMatchStatus } from "@/hooks/queries/useMatchStatus";
import { useAnalyseText } from "@/hooks/mutations/useAnalyseText";
import { useLeaveMatch } from "@/hooks/mutations/useLeaveMatch";
import { useConversationsStore } from "@/stores/conversations.store";
import { getQueueStatus } from "@/api/match.api";
import { MatchCounter } from "@/components/home/MatchCounter";
import { PromptInput } from "@/components/home/PromptInput";
import { UpgradePrompt } from "@/components/ui/UpgradePrompt";
import { AppBackground } from "@/components/ui/AppBackground";

export default function HomeScreen() {
  const router = useRouter();
  const { data: matchStatus } = useMatchStatus();
  const analyseText = useAnalyseText();
  const isSearching = useConversationsStore((s) => s.isSearching);
  const activeSearches = useConversationsStore((s) => s.activeSearches);
  const setIsSearching = useConversationsStore((s) => s.setIsSearching);
  const setActiveSearches = useConversationsStore((s) => s.setActiveSearches);
  const leaveMatch = useLeaveMatch();

  const [promptText, setPromptText] = useState("");
  const [showUpgrade, setShowUpgrade] = useState(false);

  const setMatchProposal = useConversationsStore((s) => s.setMatchProposal);

  useEffect(() => {
    getQueueStatus()
      .then((res) => {
        if (res.activeSearches) {
          setActiveSearches(res.activeSearches);
        } else {
          setIsSearching(res.inQueue);
        }
        if (res.pendingProposal) {
          setMatchProposal(res.pendingProposal);
        }
      })
      .catch(() => {});
  }, []);

  const handlePromptSubmit = () => {
    if (matchStatus && matchStatus.limit > 0 && matchStatus.remaining <= 0) {
      setShowUpgrade(true);
      return;
    }

    Keyboard.dismiss();
    analyseText.mutate(promptText, {
      onSuccess: (result) => {
        router.push({
          pathname: "/(app)/confirm",
          params: { analysis: JSON.stringify(result) },
        });
      },
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <AppBackground />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {activeSearches.length > 0 ? (
          activeSearches.map((search, i) => (
            <View key={`${search.joinedAt}-${i}`} style={styles.searchingBanner}>
              <View style={styles.searchingBannerContent}>
                <View style={styles.searchingDot} />
                <Text style={styles.searchingText}>
                  {activeSearches.length > 1
                    ? `Search ${i + 1}: Looking for a match`
                    : "Looking for your match — we'll notify you"}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  leaveMatch.mutate(search.category, {
                    onSuccess: () => {
                      const updated = activeSearches.filter((_, idx) => idx !== i);
                      setActiveSearches(updated);
                    },
                  });
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ))
        ) : isSearching ? (
          <View style={styles.searchingBanner}>
            <View style={styles.searchingBannerContent}>
              <View style={styles.searchingDot} />
              <Text style={styles.searchingText}>
                Looking for your match — we'll notify you
              </Text>
            </View>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                leaveMatch.mutate("ai-prompt", {
                  onSuccess: () => setIsSearching(false),
                });
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <MatchCounter status={matchStatus} />

        <PromptInput
          value={promptText}
          onChangeText={setPromptText}
          onSubmit={handlePromptSubmit}
          loading={analyseText.isPending}
        />

        {analyseText.isError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>
              {(analyseText.error as Error)?.message ?? "Something went wrong. Please try again."}
            </Text>
          </View>
        )}
      </ScrollView>

      <UpgradePrompt
        visible={showUpgrade}
        requiredTier="premium"
        featureName="More matches"
        onDismiss={() => setShowUpgrade(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 12,
    paddingBottom: 24,
  },
  searchingBanner: {
    backgroundColor: colors.primary + "12",
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary + "25",
    gap: 10,
  },
  searchingBannerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  searchingText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: colors.primary,
  },
  cancelButton: {
    alignSelf: "flex-end",
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: colors.primary + "18",
  },
  cancelText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: colors.primary,
  },
  errorBanner: {
    backgroundColor: colors.error + "15",
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  errorText: {
    fontSize: 13,
    color: colors.error,
    textAlign: "center",
  },
});
