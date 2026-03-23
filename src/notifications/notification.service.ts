import { EventEmitter } from "node:events";
import { redis } from "../lib/redis.js";

export type NotificationType =
  | "new_message"
  | "new_match"
  | "match_online"
  | "match_proposed"
  | "match_confirmed"
  | "match_declined"
  | "live_session_invite"
  | "live_session_started"
  | "live_session_ended"
  | "message_delivered"
  | "message_read";

export interface NotificationEvent {
  type: NotificationType;
  recipientId: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

const CHANNEL = "notifications";

class NotificationBus extends EventEmitter {}

export const notificationBus = new NotificationBus();

export function emitNotification(event: NotificationEvent): void {
  notificationBus.emit("notification", event);
  redis.publish(CHANNEL, JSON.stringify(event)).catch((err) => {
    console.error("Failed to publish notification:", err);
  });
}
