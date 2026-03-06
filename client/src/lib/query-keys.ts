export const queryKeys = {
  categories: ["categories"] as const,
  matchStatus: ["match", "status"] as const,
  conversations: ["conversations"] as const,
  archivedConversations: ["conversations", "archived"] as const,
  messages: (conversationId: string) =>
    ["conversations", conversationId, "messages"] as const,
};
