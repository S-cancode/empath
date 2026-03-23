import { useEffect, useState } from "react";
import { Stack, useRouter } from "expo-router";
import { colors } from "@/theme/colors";
import { useGlobalMessageListener } from "@/hooks/socket/useGlobalMessageListener";
import { useConversationsStore } from "@/stores/conversations.store";
import { useRegisterPushToken } from "@/hooks/useRegisterPushToken";
import { useNotificationNavigation } from "@/hooks/useNotificationNavigation";
import { useSocket } from "@/providers/SocketProvider";
import { MatchProposalModal } from "@/components/match/MatchProposalModal";
import { queryClient } from "@/providers/QueryProvider";
import { queryKeys } from "@/lib/query-keys";

export default function AppLayout() {
  useGlobalMessageListener();
  useRegisterPushToken();
  useNotificationNavigation();

  const router = useRouter();
  const { socket } = useSocket();
  const matchProposal = useConversationsStore((s) => s.matchProposal);
  const setMatchProposal = useConversationsStore((s) => s.setMatchProposal);
  const setIsSearching = useConversationsStore((s) => s.setIsSearching);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    useConversationsStore.getState().loadNicknames();
  }, []);

  const handleAccept = () => {
    if (!socket || !matchProposal) return;
    setAccepting(true);
    socket.emit("match:accept" as any, { proposalId: matchProposal.proposalId });

    // Listen for confirmation (both accepted)
    const handler = (data: { conversationId: string }) => {
      setAccepting(false);
      setMatchProposal(null);
      setIsSearching(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      router.push(`/(app)/chat/${data.conversationId}`);
    };
    socket.once("match:confirmed" as any, handler);

    // Timeout after 30s if partner hasn't accepted yet
    setTimeout(() => {
      socket.off("match:confirmed" as any, handler);
      setAccepting(false);
    }, 30000);
  };

  const handleDecline = () => {
    if (!socket || !matchProposal) return;
    socket.emit("match:decline" as any, { proposalId: matchProposal.proposalId });
    setMatchProposal(null);
    setIsSearching(false);
  };

  return (
    <>
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

      {matchProposal && (
        <MatchProposalModal
          visible={!!matchProposal}
          partnerSummary={matchProposal.partnerSummary}
          partnerCategory={matchProposal.partnerCategory}
          onAccept={handleAccept}
          onDecline={handleDecline}
          loading={accepting}
        />
      )}
    </>
  );
}
