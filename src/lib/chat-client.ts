/** Browser-side chat data access. Every read and write is enforced by database policies and checked actions. */
import { supabase } from "@/integrations/supabase/client";
import { safeFileName } from "./chat";

export const chatKeys = {
  all: ["chat"] as const,
  list: ["chat", "list"] as const,
  unread: ["chat", "unread"] as const,
  messages: (id: string) => ["chat", "messages", id] as const,
  members: (id: string) => ["chat", "members", id] as const,
  conversation: (id: string) => ["chat", "conversation", id] as const,
  files: (id: string) => ["chat", "files", id] as const,
  settings: ["chat", "settings"] as const,
  suspension: ["chat", "suspension"] as const,
};

export const MESSAGE_PAGE = 40;

function unwrap<T>(result: { data: T; error: { message: string } | null }) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export type ChatConversation = Awaited<ReturnType<typeof listConversations>>[number];
export async function listConversations() {
  return unwrap(await supabase.rpc("chat_conversation_list")) ?? [];
}

export async function unreadTotal() {
  return (unwrap(await supabase.rpc("chat_unread_total")) as number | null) ?? 0;
}

export async function getConversation(id: string) {
  return unwrap(await supabase.from("chat_conversations").select("*").eq("id", id).maybeSingle());
}

export type ChatMember = Awaited<ReturnType<typeof listMembers>>[number];
export async function listMembers(id: string) {
  return unwrap(await supabase.rpc("chat_member_directory", { p_conversation: id })) ?? [];
}

export async function directory(search: string) {
  return unwrap(await supabase.rpc("chat_directory", { p_search: search })) ?? [];
}

const MESSAGE_FIELDS = "*, receipts:chat_message_receipts(user_id, delivered_at, read_at)";
export type ChatMessage = {
  id: string; conversation_id: string; sender_id: string; message_type: string; message: string | null;
  attachment_path: string | null; attachment_name: string | null; attachment_size: number | null; attachment_type: string | null;
  reply_to_message_id: string | null; forwarded_from_message_id: string | null; is_edited: boolean; edited_at: string | null;
  is_deleted: boolean; created_at: string; receipts: { user_id: string; delivered_at: string | null; read_at: string | null }[];
};

/** Newest page first (descending); callers reverse for display. */
export async function fetchMessages(id: string, before: string | null, clearedAt: string | null) {
  let query = supabase.from("chat_messages").select(MESSAGE_FIELDS).eq("conversation_id", id)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(MESSAGE_PAGE);
  if (before) query = query.lt("created_at", before);
  if (clearedAt) query = query.gt("created_at", clearedAt);
  return (unwrap(await query) ?? []) as unknown as ChatMessage[];
}

export async function searchMessages(opts: { conversationIds: string[]; q: string; from?: string; to?: string; attachmentsOnly?: boolean; conversationId?: string }) {
  const ids = opts.conversationId ? [opts.conversationId] : opts.conversationIds;
  if (ids.length === 0) return [];
  let query = supabase.from("chat_messages").select("id, conversation_id, sender_id, message, attachment_name, created_at, message_type")
    .in("conversation_id", ids.slice(0, 200)).eq("is_deleted", false).neq("message_type", "system")
    .order("created_at", { ascending: false }).limit(50);
  const q = opts.q.trim().replace(/[%_,()]/g, " ");
  if (q) query = query.or(`message.ilike.%${q}%,attachment_name.ilike.%${q}%`);
  if (opts.from) query = query.gte("created_at", opts.from);
  if (opts.to) query = query.lt("created_at", opts.to);
  if (opts.attachmentsOnly) query = query.not("attachment_path", "is", null);
  return unwrap(await query) ?? [];
}

export async function sharedFiles(id: string) {
  return unwrap(await supabase.from("chat_messages").select("id, sender_id, attachment_path, attachment_name, attachment_size, attachment_type, created_at")
    .eq("conversation_id", id).eq("is_deleted", false).not("attachment_path", "is", null).order("created_at", { ascending: false }).limit(100)) ?? [];
}

export async function sendMessage(input: { conversationId: string; text: string; replyTo?: string | null; attachment?: { path: string; name: string; size: number; type: string } | null; forwardFrom?: string | null }) {
  return unwrap(await supabase.rpc("send_chat_message", {
    p_conversation: input.conversationId,
    p_message: input.text,
    ...(input.replyTo ? { p_reply_to: input.replyTo } : {}),
    ...(input.attachment ? { p_attachment_path: input.attachment.path, p_attachment_name: input.attachment.name, p_attachment_size: input.attachment.size, p_attachment_type: input.attachment.type } : {}),
    ...(input.forwardFrom ? { p_forward_from: input.forwardFrom } : {}),
  }));
}

export const startPrivateChat = async (other: string) => unwrap(await supabase.rpc("start_private_chat", { p_other: other })) as string;
export const createGroup = async (title: string, description: string, members: string[]) =>
  unwrap(await supabase.rpc("create_group_chat", { p_title: title, p_description: description, p_members: members })) as string;
export const updateGroup = async (id: string, title: string, description: string, photo: string | null) =>
  unwrap(await supabase.rpc("update_group_chat", { p_conversation: id, p_title: title, p_description: description, ...(photo ? { p_photo: photo } : {}) } as never));
export const manageMember = async (id: string, user: string, action: "add" | "remove" | "leave" | "moderator" | "member") =>
  unwrap(await supabase.rpc("manage_group_member", { p_conversation: id, p_user: user, p_action: action }));
export const editMessage = async (id: string, text: string) => unwrap(await supabase.rpc("edit_chat_message", { p_message: id, p_text: text }));
export const deleteMessage = async (id: string) => unwrap(await supabase.rpc("delete_chat_message", { p_message: id }));
export const markRead = async (id: string) => unwrap(await supabase.rpc("mark_chat_read", { p_conversation: id }));
export const markDelivered = async () => unwrap(await supabase.rpc("mark_chat_delivered"));
export const setFlag = async (id: string, flag: "pinned" | "muted" | "archived" | "unread" | "cleared", value: boolean) =>
  unwrap(await supabase.rpc("set_chat_flags", { p_conversation: id, p_flag: flag, p_value: value }));
export const reportMessage = async (id: string, reason: string) => unwrap(await supabase.rpc("report_chat_message", { p_message: id, p_reason: reason }));

export async function getSettings(userId: string) {
  return unwrap(await supabase.from("chat_user_settings").select("*").eq("user_id", userId).maybeSingle());
}
export type ChatSettings = NonNullable<Awaited<ReturnType<typeof getSettings>>>;
export async function saveSettings(userId: string, patch: Partial<Omit<ChatSettings, "user_id">>) {
  return unwrap(await supabase.from("chat_user_settings").upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }));
}

export async function mySuspension(userId: string) {
  return unwrap(await supabase.from("chat_suspensions").select("reason, created_at").eq("user_id", userId).maybeSingle());
}

const signedCache = new Map<string, { url: string; expires: number }>();
export async function attachmentUrl(path: string, download?: string) {
  const key = `${path}|${download ?? ""}`;
  const hit = signedCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.url;
  const result = await supabase.storage.from("chat-attachments").createSignedUrl(path, 600, download ? { download } : undefined);
  if (result.error || !result.data) throw new Error("This file is not available.");
  signedCache.set(key, { url: result.data.signedUrl, expires: Date.now() + 540_000 });
  return result.data.signedUrl;
}

/** Uploads into the caller's own folder of the conversation, reporting progress (0–100). */
export async function uploadAttachment(conversationId: string, userId: string, file: File, onProgress: (pct: number) => void, signal?: AbortSignal) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Please sign in again.");
  const path = `${conversationId}/${userId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const base = import.meta.env["VITE_SUPABASE_URL"] as string;
  const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string;
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base}/storage/v1/object/chat-attachments/${path.split("/").map(encodeURIComponent).join("/")}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", key);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhr.status === 413 ? "File is too large." : "Upload failed. Please try again.")));
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection."));
    signal?.addEventListener("abort", () => { xhr.abort(); reject(new Error("Upload cancelled")); });
    xhr.send(file);
  });
  return { path, name: file.name, size: file.size, type: file.type || "application/octet-stream" };
}
