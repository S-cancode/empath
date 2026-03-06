import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";

function handleNotificationData(data: Record<string, unknown> | undefined) {
  if (data?.screen === "chat" && data?.conversationId) {
    router.push(`/(app)/chat/${data.conversationId}`);
  }
}

export function useNotificationNavigation() {
  // Handle notification tapped while app is backgrounded
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        handleNotificationData(
          response.notification.request.content.data as Record<string, unknown>
        );
      }
    );
    return () => subscription.remove();
  }, []);

  // Handle cold-start: app was launched by tapping a notification
  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      handleNotificationData(
        response.notification.request.content.data as Record<string, unknown>
      );
    });
  }, []);
}
