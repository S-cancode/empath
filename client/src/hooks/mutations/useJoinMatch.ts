import { useMutation, useQueryClient } from "@tanstack/react-query";
import { joinMatch } from "@/api/match.api";
import { queryKeys } from "@/lib/query-keys";
import type { JoinMatchPayload } from "@/types/api";

export function useJoinMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: JoinMatchPayload) => joinMatch(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.matchStatus });
    },
  });
}
