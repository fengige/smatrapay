import type { NotificationRow } from "./notifications.functions";

export const RECENT_NOTIFICATION_LIMIT = 5;

/** The server returns newest first; keep that order and bound the menu. */
export function recentNotifications(notifications: NotificationRow[]) {
  return notifications.slice(0, RECENT_NOTIFICATION_LIMIT);
}
