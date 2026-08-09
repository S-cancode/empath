import { useEffect, useState, useRef } from "react";
import { Stack, useRouter } from "expo-router";
import { colors } from "@/theme/colors";
import { useGlobalMessageListener } from "@/hooks/socket/useGlobalMessageListener";
import { useConversationsStore } from "@/stores/conversations.store";
import { useRegisterPushToken } from "@/hooks/useRegisterPushToken";
import { useNotificationNavigation } from "@/hooks/useNotificationNavigation";
import { useLocaleBootstrap } from "@/hooks/useLocaleBootstrap";
import { useSocket } from "@/providers/SocketProvider";
import { MatchProposalModal } from "@/components/match/MatchProposalModal";
import { queryClient } from "@/providers/QueryProvider";
import { queryKeys } from "@/lib/query-keys";
import * as Updates from "expo-updates";

export default function AppLayout() {
  useGlobalMessageListener();
  useRegisterPushToken();
  useNotificationNavigation();
  useLocaleBootstrap();

  const router = useRouter();
  const { socket } = useSocket();
  const matchProposal = useConversationsStore((s) => s.matchProposal);
  const setMatchProposal = useConversationsStore((s) => s.setMatchProposal);
  const setIsSearching = useConversationsStore((s) => s.setIsSearching);
  const [accepting, setAccepting] = useState(false);
  const acceptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    useConversationsStore.getState().loadNicknames();
  }, []);

  // Review build only: idempotently provision the reviewer's scripted demo
  // conversation, which then appears in the normal inbox. The server returns
  // 404 for non-reviewers, so this is a no-op for everyone else.
  useEffect(() => {
    if (process.env.EXPO_PUBLIC_REVIEW_MODE !== "true") return;
    let cancelled = false;
    import("@/api/review.api").then(({ ensureReviewDemo }) =>
      ensureReviewDemo().then((id) => {
        if (!cancelled && id) {
          queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
        }
      }),
    );
    return () => { cancelled = true; };
  }, []);

  // Check for OTA updates on launch
  useEffect(() => {
    async function checkForUpdates() {
      try {
        if (__DEV__) return;
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch {}
    }
    checkForUpdates();
  }, []);

  // Listen globally for match:confirmed — partner can accept at any time
  useEffect(() => {
    if (!socket) return;
    const handler = (data: { conversationId: string }) => {
      // Cancel the pending accept timer so it doesn't overwrite state
      if (acceptTimerRef.current) {
        clearTimeout(acceptTimerRef.current);
        acceptTimerRef.current = null;
      }
      setAccepting(false);
      setMatchProposal(null);
      setIsSearching(false);
      useConversationsStore.getState().setPendingMatchAccepted(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      router.push(`/(app)/chat/${data.conversationId}`);
    };
    socket.on("match:confirmed" as any, handler);
    return () => { socket.off("match:confirmed" as any, handler); };
  }, [socket]);

  const handleAccept = () => {
    if (!socket || !matchProposal) return;
    setAccepting(true);
    socket.emit("match:accept" as any, { proposalId: matchProposal.proposalId });

    // Brief delay then dismiss modal and go to home with pending state
    // Timer is stored in ref so match:confirmed handler can cancel it
    acceptTimerRef.current = setTimeout(() => {
      acceptTimerRef.current = null;
      setAccepting(false);
      setMatchProposal(null);
      useConversationsStore.getState().setPendingMatchAccepted(true);
      router.push("/(app)/(tabs)");
    }, 1500);
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
          name="chat/[conversationId]"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="confirm"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="privacy-notice"
          options={{ headerShown: false, presentation: "modal" }}
        />
        <Stack.Screen
          name="terms"
          options={{ headerShown: false, presentation: "modal" }}
        />
        <Stack.Screen
          name="blocked"
          options={{
            title: "Blocked Users",
            headerBackTitle: "Back",
            headerStyle: { backgroundColor: "transparent" },
            headerShadowVisible: false,
            headerTintColor: colors.text,
          }}
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
