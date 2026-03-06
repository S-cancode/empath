import { useInfiniteQuery } from "@tanstack/react-query";
import { getMessages } from "@/api/conversations.api";
import { queryKeys } from "@/lib/query-keys";
import type { Message } from "@/types/api";

export function useMessages(conversationId: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.messages(conversationId),
    queryFn: ({ pageParam }) =>
      getMessages(conversationId, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: Message[]) => {
      if (lastPage.length < 50) return undefined;
      return lastPage[lastPage.length - 1]?.id;
    },
    staleTime: 10_000,
  });
}
