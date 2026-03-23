import { useEffect } from "react";
import { Stack } from "expo-router";
import { colors } from "@/theme/colors";
import { useGlobalMessageListener } from "@/hooks/socket/useGlobalMessageListener";
import { useConversationsStore } from "@/stores/conversations.store";
import { useRegisterPushToken } from "@/hooks/useRegisterPushToken";
import { useNotificationNavigation } from "@/hooks/useNotificationNavigation";

export default function AppLayout() {
  useGlobalMessageListener();
  useRegisterPushToken();
  useNotificationNavigation();
  useEffect(() => {
    useConversationsStore.getState().loadNicknames();
  }, []);
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="queue/[category]"
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen
        name="chat/[conversationId]"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="live/[liveSessionId]"
        options={{ headerShown: false, presentation: "fullScreenModal" }}
      />
      <Stack.Screen
        name="confirm"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="post-session"
        options={{ headerShown: false, presentation: "fullScreenModal" }}
      />
      <Stack.Screen
        name="archived/index"
        options={{
          title: "Archived",
          headerBackTitle: "Back",
          headerStyle: { backgroundColor: "transparent" },
          headerShadowVisible: false,
          headerTintColor: colors.text,
        }}
      />
    </Stack>
  );
}
