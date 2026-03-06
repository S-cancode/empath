import { useQuery } from "@tanstack/react-query";
import { getMatchStatus } from "@/api/match.api";
import { queryKeys } from "@/lib/query-keys";

export function useMatchStatus() {
  return useQuery({
    queryKey: queryKeys.matchStatus,
    queryFn: getMatchStatus,
    staleTime: 30_000,
  });
}
