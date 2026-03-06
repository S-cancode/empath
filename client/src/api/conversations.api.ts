import { apiClient } from "./client";
import type { Conversation, Message, ReconnectResponse } from "@/types/api";

export async function getConversations(): Promise<Conversation[]> {
  const { data } = await apiClient.get<Conversation[]>("/conversations");
  return data;
}

export async function getArchivedConversations(): Promise<Conversation[]> {
  const { data } = await apiClient.get<Conversation[]>(
    "/conversations/archived"
  );
  return data;
}

export async function getMessages(
  conversationId: string,
  cursor?: string,
  limit = 50
): Promise<Message[]> {
  const params: Record<string, string | number> = { limit };
  if (cursor) params.cursor = cursor;
  const { data } = await apiClient.get<Message[]>(
    `/conversations/${conversationId}/messages`,
    { params }
  );
  return data;
}

export async function sendMessage(
  conversationId: string,
  content: string
): Promise<{ id: string; sentAt: string }> {
  const { data } = await apiClient.post<{ id: string; sentAt: string }>(
    `/conversations/${conversationId}/messages`,
    { content }
  );
  return data;
}

export async function markRead(
  conversationId: string,
  upToMessageId: string
): Promise<void> {
  await apiClient.put(`/conversations/${conversationId}/messages/read`, {
    upToMessageId,
  });
}

export async function archiveConversation(
  conversationId: string
): Promise<void> {
  await apiClient.put(`/conversations/${conversationId}/archive`);
}

export async function reconnect(
  conversationId: string
): Promise<ReconnectResponse> {
  const { data } = await apiClient.post<ReconnectResponse>(
    `/conversations/${conversationId}/reconnect`
  );
  return data;
}

export async function reportUser(payload: {
  conversationId: string;
  reportedUserId: string;
  reason: string;
  details?: string;
}): Promise<{ id: string }> {
  const { data } = await apiClient.post<{ id: string }>(
    "/safety/report",
    payload
  );
  return data;
}

export async function blockUser(blockedUserId: string): Promise<void> {
  await apiClient.post("/safety/block", { blockedUserId });
}
