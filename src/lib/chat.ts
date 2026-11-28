/** Pure chat helpers shared by the chat screens (no browser or database access). */
export const CHAT_MAX_FILE_BYTES = 20 * 1024 * 1024;
export const CHAT_MAX_MESSAGE_LENGTH = 4000;
export const CHAT_ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
  "text/plain",
  "application/zip",
];
export const CHAT_ACCEPT = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip";
export const CHAT_ROLES = ["admin", "vendor", "landlord"] as const;

export type ChatHistoryCursor = { created_at: string; id: string };
export function nextChatHistoryCursor(page: ChatHistoryCursor[], pageSize: number): ChatHistoryCursor | undefined {
  const last = page.at(-1);
  return page.length === pageSize && last ? { created_at: last.created_at, id: last.id } : undefined;
}

export function canUseChat(roles: string[]) {
  return roles.some((role) => (CHAT_ROLES as readonly string[]).includes(role));
}

export function chatRoleLabel(role: string | null | undefined) {
  if (role === "admin") return "Administrator";
  if (role === "vendor") return "Vendor";
  if (role === "landlord") return "Landlord";
  return "Member";
}

/** Returns a friendly error, or null when the file may be sent. */
export function validateChatFile(file: { name: string; size: number; type: string }) {
  if (file.size <= 0) return `${file.name} is empty.`;
  if (file.size > CHAT_MAX_FILE_BYTES) return `${file.name} is larger than 20 MB.`;
  if (file.type.startsWith("image/") || CHAT_ALLOWED_TYPES.includes(file.type)) return null;
  return `${file.name} is not a supported file type. Send images, PDF, Word, Excel, PowerPoint, CSV, text or ZIP files.`;
}

export function safeFileName(name: string) {
  const cleaned = name.normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").slice(-120);
  return cleaned || "file";
}

export function formatBytes(bytes: number | null | undefined) {
  if (!bytes || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "Today", "Yesterday" or a full date for message separators. */
export function dayLabel(value: string | Date, now = new Date()) {
  const date = new Date(value);
  const diff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return date.toLocaleDateString("en-KE", { weekday: diff < 7 ? "long" : undefined, day: "numeric", month: "short", year: "numeric" });
}

export function shortTime(value: string | Date, now = new Date()) {
  const date = new Date(value);
  const diff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (diff === 0) return date.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });
  if (diff === 1) return "Yesterday";
  if (diff < 7) return date.toLocaleDateString("en-KE", { weekday: "short" });
  return date.toLocaleDateString("en-KE", { day: "numeric", month: "short" });
}

export type ChatReceipt = { user_id: string; delivered_at: string | null; read_at: string | null };
export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";

/** Delivery state of my own message: read only when every recipient has read it. */
export function messageStatus(receipts: ChatReceipt[], local?: "sending" | "failed"): MessageStatus {
  if (local) return local;
  if (receipts.length === 0) return "sent";
  if (receipts.every((r) => r.read_at)) return "read";
  if (receipts.every((r) => r.delivered_at || r.read_at)) return "delivered";
  return "sent";
}

export type TimelineMessage = { id: string; sender_id: string; created_at: string; message_type: string };
export type TimelineEntry<T> =
  | { kind: "day"; key: string; label: string }
  | { kind: "message"; key: string; message: T; firstInGroup: boolean };

/** Oldest-first messages → day separators plus "first in group" flags for consecutive senders. */
export function buildTimeline<T extends TimelineMessage>(messages: T[], now = new Date()): TimelineEntry<T>[] {
  const out: TimelineEntry<T>[] = [];
  let lastDay = "";
  let prev: T | undefined;
  for (const message of messages) {
    const day = new Date(message.created_at).toDateString();
    if (day !== lastDay) {
      out.push({ kind: "day", key: `day-${day}`, label: dayLabel(message.created_at, now) });
      lastDay = day;
      prev = undefined;
    }
    const gap = prev ? new Date(message.created_at).getTime() - new Date(prev.created_at).getTime() : Infinity;
    const firstInGroup = !prev || prev.sender_id !== message.sender_id || prev.message_type === "system" || message.message_type === "system" || gap > 5 * 60_000;
    out.push({ kind: "message", key: message.id, message, firstInGroup });
    prev = message;
  }
  return out;
}

export type ChatFilter = "all" | "unread" | "vendor" | "landlord" | "group" | "archived";
export type ConversationSummary = {
  conversation_type: string;
  title: string | null;
  other_name: string | null;
  other_role: string | null;
  unread_count: number;
  manual_unread: boolean;
  is_archived: boolean;
  is_pinned: boolean;
  last_message_at: string;
};

export function conversationName(c: Pick<ConversationSummary, "conversation_type" | "title" | "other_name">) {
  return c.conversation_type === "group" ? c.title || "Group" : c.other_name || "User";
}

export function filterConversations<T extends ConversationSummary>(list: T[], filter: ChatFilter, search: string) {
  const q = search.trim().toLowerCase();
  return list
    .filter((c) => (filter === "archived" ? c.is_archived : !c.is_archived))
    .filter((c) => {
      if (filter === "unread") return c.unread_count > 0 || c.manual_unread;
      if (filter === "group") return c.conversation_type === "group";
      if (filter === "vendor" || filter === "landlord") return c.conversation_type === "private" && c.other_role === filter;
      return true;
    })
    .filter((c) => !q || conversationName(c).toLowerCase().includes(q))
    .sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || b.last_message_at.localeCompare(a.last_message_at));
}

/** True when `now` falls inside quiet hours "HH:MM[:SS]" (ranges may cross midnight). */
export function inQuietHours(start: string | null | undefined, end: string | null | undefined, now = new Date()) {
  if (!start || !end) return false;
  const toMin = (v: string) => {
    const [h = "0", m = "0"] = v.split(":");
    return Number(h) * 60 + Number(m);
  };
  const s = toMin(start);
  const e = toMin(end);
  const n = now.getHours() * 60 + now.getMinutes();
  if (s === e) return false;
  return s < e ? n >= s && n < e : n >= s || n < e;
}

export function friendlyChatError(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : "";
  if (/suspended|too quickly|only message|only administrators|not part|cannot be empty|characters|cannot report|cannot delete|only edit|forwarded|group name|members/i.test(message)) return message;
  if (/fetch|network/i.test(message)) return "You appear to be offline. Check your connection and try again.";
  return "Something went wrong. Please try again.";
}

export const QUICK_EMOJIS = ["😀","😂","😊","😍","🙏","👍","👏","🎉","🔥","✅","❌","⚠️","💡","📌","📎","📄","💰","🏠","⚡","💧","🔧","📞","🕐","❤️","😢","😮","🤝","👌","🙌","🚀","📊","✍️"];
