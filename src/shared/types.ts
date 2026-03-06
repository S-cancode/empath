export enum ConversationStatus {
  ACTIVE = "active",
  ARCHIVED = "archived",
  BLOCKED = "blocked",
}

export enum LiveSessionStatus {
  ACTIVE = "active",
  COMPLETED = "completed",
  TERMINATED = "terminated",
}

export enum MessageDeliveryStatus {
  SENT = "sent",
  DELIVERED = "delivered",
  READ = "read",
}

export enum ReportStatus {
  PENDING = "pending",
  REVIEWED = "reviewed",
  RESOLVED = "resolved",
}

export enum SubscriptionTier {
  FREE = "free",
  PREMIUM = "premium",
  PLUS = "plus",
}

export interface JwtPayload {
  userId: string;
  tier: SubscriptionTier;
}

export interface RefreshTokenPayload {
  userId: string;
  tokenVersion: number;
}
