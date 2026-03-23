import React from "react";
import { View, Text, StyleSheet, Alert, TouchableOpacity } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { Button } from "@/components/ui/Button";
import { AppBackground } from "@/components/ui/AppBackground";
import { useBlockUser } from "@/hooks/mutations/useBlockUser";
import { useConversations } from "@/hooks/queries/useConversations";

export default function PostSessionScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const router = useRouter();
  const blockMutation = useBlockUser();
  const { data: conversations } = useConversations();
  const conversation = conversations?.find((c) => c.id === conversationId);

  const handleFine = () => {
    router.replace("/(app)/(tabs)/inbox");
  };

  const handleReport = () => {
    router.replace({
      pathname: "/(app)/chat/[conversationId]",
      params: { conversationId: conversationId!, openReport: "true" },
    });
  };

  const handleBlock = () => {
    if (!conversation) return;
    Alert.alert(
      "Block this user?",
      "You will never be matched with them again. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: () => {
            blockMutation.mutate(conversation.partner.id, {
              onSuccess: () => {
                Alert.alert("User blocked", "You will not be matched with them again.");
                router.replace("/(app)/(tabs)/inbox");
              },
            });
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <AppBackground />
      <View style={styles.content}>
        <Text style={styles.title}>Session ended</Text>
        <Text style={styles.subtitle}>How was your conversation?</Text>

        <View style={styles.buttons}>
          <Button title="It was fine" onPress={handleFine} />
          <Button
            title="Something was not right"
            variant="outline"
            onPress={handleReport}
            style={{ marginTop: 12 }}
          />
        </View>

        {conversation && (
          <TouchableOpacity onPress={handleBlock} style={{ marginTop: 16 }}>
            <Text style={styles.blockLink}>Block this user</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.notice}>
          Messages from this conversation are stored for 7 days. If you need to
          report something, please do so within this period.
        </Text>
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
    ...typography.h1,
    color: colors.text,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 8,
    textAlign: "center",
  },
  buttons: {
    marginTop: 32,
    width: "100%",
  },
  blockLink: {
    ...typography.body,
    color: colors.error,
    textDecorationLine: "underline",
  },
  notice: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 24,
    paddingHorizontal: 16,
  },
});
