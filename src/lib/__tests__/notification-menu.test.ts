import { describe, expect, it } from "vitest";
import { recentNotifications, RECENT_NOTIFICATION_LIMIT } from "../notification-menu";
import type { NotificationRow } from "../notifications.functions";

function notification(id: string): NotificationRow {
  return {
    id,
    type: "account",
    title: `Notification ${id}`,
    message: null,
    resource_type: null,
    resource_id: null,
    read_at: null,
    created_at: "2026-11-27T20:00:00.000Z",
  };
}

describe("recentNotifications", () => {
  it("shows only the five latest server-ordered notifications", () => {
    const notifications = ["1", "2", "3", "4", "5", "6"].map(notification);
    expect(RECENT_NOTIFICATION_LIMIT).toBe(5);
    expect(recentNotifications(notifications).map((item) => item.id)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("returns every notification when fewer than five exist", () => {
    expect(recentNotifications([notification("1"), notification("2")])).toHaveLength(2);
  });
});
