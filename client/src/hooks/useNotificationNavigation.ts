import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useConversationsStore } from "@/stores/conversations.store";

function handleNotificationData(data: Record<string, unknown> | undefined) {
  if (data?.screen === "chat" && data?.conversationId) {
    router.push(`/(app)/chat/${data.conversationId}`);
  } else if (data?.screen === "match" && data?.proposalId) {
    // Show the match proposal modal by setting state
    useConversationsStore.getState().setMatchProposal({
      proposalId: data.proposalId as string,
      partnerSummary: (data.partnerSummary as string) ?? "Someone going through a similar experience.",
      partnerCategory: (data.partnerCategory as string) ?? "",
    });
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
