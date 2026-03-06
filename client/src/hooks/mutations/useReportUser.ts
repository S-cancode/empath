import { useMutation } from "@tanstack/react-query";
import { reportUser } from "@/api/conversations.api";

export function useReportUser() {
  return useMutation({
    mutationFn: (payload: {
      conversationId: string;
      reportedUserId: string;
      reason: string;
      details?: string;
    }) => reportUser(payload),
  });
}
