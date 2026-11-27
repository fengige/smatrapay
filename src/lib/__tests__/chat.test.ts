import { describe, expect, it } from "vitest";
import { buildTimeline, canUseChat, filterConversations, inQuietHours, messageStatus, validateChatFile } from "../chat";

const conv = (o: Partial<Parameters<typeof filterConversations>[0][number]>) => ({
  conversation_type: "private", title: null, other_name: "A", other_role: "vendor", unread_count: 0,
  manual_unread: false, is_archived: false, is_pinned: false, last_message_at: "2026-01-01T00:00:00Z", ...o,
});

describe("chat rules", () => {
  it("only administrators, vendors and landlords can use chat", () => {
    expect(canUseChat(["vendor"])).toBe(true);
    expect(canUseChat(["landlord"])).toBe(true);
    expect(canUseChat(["admin"])).toBe(true);
    expect(canUseChat(["resident"])).toBe(false);
  });
  it("rejects files over 20 MB and unsupported types", () => {
    expect(validateChatFile({ name: "a.pdf", size: 21 * 1024 * 1024, type: "application/pdf" })).toMatch(/20 MB/);
    expect(validateChatFile({ name: "a.exe", size: 10, type: "application/x-msdownload" })).toMatch(/not a supported/);
    expect(validateChatFile({ name: "a.png", size: 10, type: "image/png" })).toBeNull();
    expect(validateChatFile({ name: "a.xlsx", size: 10, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })).toBeNull();
  });
  it("marks a message read only when every recipient has read it", () => {
    expect(messageStatus([])).toBe("sent");
    expect(messageStatus([{ user_id: "a", delivered_at: "x", read_at: null }])).toBe("delivered");
    expect(messageStatus([{ user_id: "a", delivered_at: "x", read_at: "y" }, { user_id: "b", delivered_at: null, read_at: null }])).toBe("sent");
    expect(messageStatus([{ user_id: "a", delivered_at: "x", read_at: "y" }])).toBe("read");
    expect(messageStatus([], "failed")).toBe("failed");
  });
  it("groups consecutive messages and adds day separators", () => {
    const now = new Date("2026-03-10T12:00:00");
    const t = buildTimeline([
      { id: "1", sender_id: "a", created_at: "2026-03-09T10:00:00", message_type: "text" },
      { id: "2", sender_id: "a", created_at: "2026-03-10T10:00:00", message_type: "text" },
      { id: "3", sender_id: "a", created_at: "2026-03-10T10:01:00", message_type: "text" },
      { id: "4", sender_id: "b", created_at: "2026-03-10T10:02:00", message_type: "text" },
    ], now);
    expect(t.filter((e) => e.kind === "day").map((e) => e.kind === "day" && e.label)).toEqual(["Yesterday", "Today"]);
    expect(t.filter((e) => e.kind === "message").map((e) => e.kind === "message" && e.firstInGroup)).toEqual([true, true, false, true]);
  });
  it("filters conversations and keeps pinned first", () => {
    const list = [conv({ other_name: "Old", last_message_at: "2026-01-01" }), conv({ other_name: "Pin", is_pinned: true }), conv({ other_name: "L", other_role: "landlord", unread_count: 2, last_message_at: "2026-02-01" }), conv({ conversation_type: "group", title: "Ops" }), conv({ other_name: "Arch", is_archived: true })];
    expect(filterConversations(list, "all", "").map((c) => c.other_name ?? c.title)).toEqual(["Pin", "L", "A", "Old"]);
    expect(filterConversations(list, "landlord", "").length).toBe(1);
    expect(filterConversations(list, "unread", "").length).toBe(1);
    expect(filterConversations(list, "group", "").length).toBe(1);
    expect(filterConversations(list, "archived", "").length).toBe(1);
    expect(filterConversations(list, "all", "ops").length).toBe(1);
  });
  it("handles quiet hours across midnight", () => {
    expect(inQuietHours("22:00", "06:00", new Date("2026-01-01T23:30:00"))).toBe(true);
    expect(inQuietHours("22:00", "06:00", new Date("2026-01-01T12:00:00"))).toBe(false);
    expect(inQuietHours(null, "06:00")).toBe(false);
  });
});
