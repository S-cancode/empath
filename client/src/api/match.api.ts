import { apiClient } from "./client";
import type { MatchStatus, JoinMatchResponse, AnalyseResult, JoinMatchPayload } from "@/types/api";

export async function getMatchStatus(): Promise<MatchStatus> {
  const { data } = await apiClient.get<MatchStatus>("/match/status");
  return data;
}

export async function analyseText(text: string): Promise<AnalyseResult> {
  const { data } = await apiClient.post<AnalyseResult>("/match/analyse", { text });
  return data;
}

export async function joinMatch(payload: JoinMatchPayload): Promise<JoinMatchResponse> {
  const { data } = await apiClient.post<JoinMatchResponse>("/match/join", payload);
  return data;
}

export async function leaveMatch(category: string): Promise<void> {
  await apiClient.delete("/match/leave", { params: { category } });
}

export interface QueueStatus {
  inQueue: boolean;
  pendingProposal?: {
    proposalId: string;
    partnerSummary: string;
    partnerCategory: string;
  };
}

export async function getQueueStatus(): Promise<QueueStatus> {
  const { data } = await apiClient.get<QueueStatus>("/match/queue-status");
  return data;
}
