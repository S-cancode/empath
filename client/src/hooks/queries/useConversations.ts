import { useQuery } from "@tanstack/react-query";
import { getConversations } from "@/api/conversations.api";
import { queryKeys } from "@/lib/query-keys";

export function useConversations(options?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: queryKeys.conversations,
    queryFn: getConversations,
    staleTime: 5_000,
    refetchInterval: options?.refetchInterval,
  });
}
