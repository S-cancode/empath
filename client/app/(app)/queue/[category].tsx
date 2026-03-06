import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { useConversations } from "@/hooks/queries/useConversations";
import { useLeaveMatch } from "@/hooks/mutations/useLeaveMatch";
import { QueueAnimation } from "@/components/queue/QueueAnimation";
import { Button } from "@/components/ui/Button";
import { AppBackground } from "@/components/ui/AppBackground";

export default function QueueScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const router = useRouter();
  const leaveMatch = useLeaveMatch();

  // Track known conversation IDs before entering queue
  const knownIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const { data: conversations } = useConversations({ refetchInterval: 3000 });

  // Capture existing conversations on first load
  useEffect(() => {
    if (conversations && !initializedRef.current) {
      knownIdsRef.current = new Set(conversations.map((c) => c.id));
      initializedRef.current = true;
    }
  }, [conversations]);

  // Detect new conversation (match found)
  useEffect(() => {
    if (!conversations || !initializedRef.current) return;
    const newConversation = conversations.find(
      (c) => !knownIdsRef.current.has(c.id)
    );
    if (newConversation) {
      router.replace(`/(app)/chat/${newConversation.id}`);
    }
  }, [conversations]);

  const handleCancel = () => {
    if (category) {
      leaveMatch.mutate(category);
    }
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      <AppBackground />
      <View style={styles.content}>
        <QueueAnimation />
        <Text style={styles.title}>Searching...</Text>
        <Text style={styles.subtitle}>
          {category === "ai-prompt"
            ? "Finding someone who understands\nwhat you're going through..."
            : <>Looking for someone to talk about{"\n"}<Text style={styles.category}>{category}</Text></>
          }
        </Text>
      </View>
      <View style={styles.footer}>
        <Button title="Cancel" variant="secondary" onPress={handleCancel} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  title: {
    ...typography.h2,
    color: colors.text,
    marginTop: 32,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 8,
  },
  category: {
    color: colors.primary,
    fontFamily: "Inter_600SemiBold",
  },
  footer: {
    padding: 24,
  },
});
