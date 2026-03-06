import React, { useState } from "react";
import { View, ScrollView, StyleSheet, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { useCategories } from "@/hooks/queries/useCategories";
import { useMatchStatus } from "@/hooks/queries/useMatchStatus";
import { useJoinMatch } from "@/hooks/mutations/useJoinMatch";
import { useAnalyseText } from "@/hooks/mutations/useAnalyseText";
import { CategoryGrid } from "@/components/home/CategoryGrid";
import { MatchCounter } from "@/components/home/MatchCounter";
import { PromptInput } from "@/components/home/PromptInput";
import { SubTagSheet } from "@/components/home/SubTagSheet";
import { UpgradePrompt } from "@/components/ui/UpgradePrompt";
import { AppBackground } from "@/components/ui/AppBackground";
import type { Category } from "@/types/api";

export default function HomeScreen() {
  const router = useRouter();
  const { data: categories, isLoading } = useCategories();
  const { data: matchStatus } = useMatchStatus();
  const joinMatch = useJoinMatch();
  const analyseText = useAnalyseText();

  const [promptText, setPromptText] = useState("");
  const [showCategories, setShowCategories] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const handlePromptSubmit = () => {
    if (matchStatus && matchStatus.limit > 0 && matchStatus.remaining <= 0) {
      setShowUpgrade(true);
      return;
    }

    analyseText.mutate(promptText, {
      onSuccess: (result) => {
        router.push({
          pathname: "/(app)/confirm",
          params: { analysis: JSON.stringify(result) },
        });
      },
    });
  };

  const handleFindMatch = (category: string, subTag?: string) => {
    if (matchStatus && matchStatus.limit > 0 && matchStatus.remaining <= 0) {
      setSelectedCategory(null);
      setShowUpgrade(true);
      return;
    }

    joinMatch.mutate(
      { category, subTag },
      {
        onSuccess: () => {
          setSelectedCategory(null);
          router.push(`/(app)/queue/${category}`);
        },
      }
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppBackground />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
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

        <TouchableOpacity
          style={styles.browseToggle}
          onPress={() => setShowCategories(!showCategories)}
          activeOpacity={0.7}
        >
          <Text style={styles.browseText}>Or browse topics</Text>
          <Ionicons
            name={showCategories ? "chevron-up" : "chevron-down"}
            size={18}
            color={colors.primary}
          />
        </TouchableOpacity>

        {showCategories && (
          <>
            {isLoading ? (
              <View style={styles.loading}>
                <Text style={styles.loadingText}>Loading categories...</Text>
              </View>
            ) : (
              <CategoryGrid
                categories={categories ?? []}
                onSelectCategory={setSelectedCategory}
              />
            )}
          </>
        )}
      </ScrollView>

      <SubTagSheet
        visible={!!selectedCategory}
        category={selectedCategory}
        onDismiss={() => setSelectedCategory(null)}
        onFindMatch={handleFindMatch}
        onUpgradeRequired={() => {
          setSelectedCategory(null);
          setShowUpgrade(true);
        }}
        loading={joinMatch.isPending}
      />

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
    paddingTop: 8,
    paddingBottom: 24,
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
  browseToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 16,
    marginTop: 8,
  },
  browseText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: colors.primary,
  },
  loading: {
    paddingVertical: 32,
    alignItems: "center",
  },
  loadingText: {
    ...typography.body,
    color: colors.textTertiary,
  },
});
