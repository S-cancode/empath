import { useMutation } from "@tanstack/react-query";
import { leaveMatch } from "@/api/match.api";

export function useLeaveMatch() {
  return useMutation({
    mutationFn: (category: string) => leaveMatch(category),
  });
}
