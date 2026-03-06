import { useQuery } from "@tanstack/react-query";
import { getArchivedConversations } from "@/api/conversations.api";
import { queryKeys } from "@/lib/query-keys";

export function useArchivedConversations() {
  return useQuery({
    queryKey: queryKeys.archivedConversations,
    queryFn: getArchivedConversations,
    staleTime: 60_000,
  });
}
