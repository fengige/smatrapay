import { useEffect, useRef } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChatAvatar } from "./ChatAvatar";
import { useChatRealtime, useChatUserId, useOnlineUsers } from "@/hooks/use-chat";
import { chatKeys, getSettings, listConversations } from "@/lib/chat-client";
import { conversationName, inQuietHours, shortTime } from "@/lib/chat";

function beep() {
  try {
    const Ctx = window.AudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
    osc.onended = () => void ctx.close();
  } catch {
    /* sound is optional */
  }
}

/** Top-bar chat icon: joins realtime once per page, shows unread total and latest conversations, and raises alerts. */
export function ChatMenu() {
  const userId = useChatUserId();
  const online = useOnlineUsers();
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location });
  const activeId = location.pathname === "/chat" ? (location.search as Record<string, unknown>)["c"] : undefined;
  useChatRealtime(userId);

  const list = useQuery({ queryKey: chatKeys.list, queryFn: listConversations, enabled: !!userId, refetchInterval: 90_000 });
  const settings = useQuery({ queryKey: chatKeys.settings, queryFn: () => getSettings(userId!), enabled: !!userId });
  const conversations = list.data ?? [];
  const unread = conversations.filter((c) => c.is_active && !c.is_archived).reduce((n, c) => n + c.unread_count + (c.manual_unread ? 1 : 0), 0);

  // Alert on newly arrived unread messages, but not for the conversation being viewed.
  const previous = useRef<Map<string, number> | null>(null);
  useEffect(() => {
    if (!list.data) return;
    const next = new Map(list.data.map((c) => [c.id, c.unread_count]));
    const prev = previous.current;
    previous.current = next;
    if (!prev) return;
    const s = settings.data;
    if (s && !s.notifications_enabled) return;
    if (s && inQuietHours(s.quiet_start, s.quiet_end)) return;
    const fresh = list.data.filter((c) => !c.is_muted && c.unread_count > (prev.get(c.id) ?? 0));
    const viewing = (id: string) => id === activeId && document.visibilityState === "visible";
    const alertable = fresh.filter((c) => !viewing(c.id));
    if (alertable.length === 0) return;
    if (s?.sound_enabled ?? true) beep();
    if (s?.browser_enabled && "Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
      for (const c of alertable.slice(0, 3)) {
        const n = new Notification(conversationName(c), { body: c.last_message ?? "New attachment", tag: `chat-${c.id}`, icon: "/favicon.ico" });
        n.onclick = () => { window.focus(); void navigate({ to: "/chat", search: { c: c.id } }); n.close(); };
      }
    }
  }, [list.data, settings.data, activeId, navigate]);

  const recent = conversations.filter((c) => !c.is_archived).slice(0, 6);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative inline-flex rounded-full border border-border p-2 text-muted-foreground transition-colors hover:text-foreground" aria-label={unread ? `Messages, ${unread} unread` : "Messages"}>
          <MessageSquare className="size-4" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.6rem] font-bold leading-4 text-primary-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="notif-wash w-[min(22rem,calc(100vw-1rem))] overflow-hidden border-primary/20 p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Messages</p>
            <p className="text-xs text-muted-foreground">{unread ? `${unread} unread` : "You're all caught up"}</p>
          </div>
          <Button asChild size="sm" variant="ghost" className="h-8 px-2 text-xs"><Link to="/chat" search={{ new: "chat" }}>New chat</Link></Button>
        </div>
        <DropdownMenuSeparator className="m-0" />
        {list.isLoading ? (
          <p role="status" className="px-4 py-6 text-center text-sm text-muted-foreground">Loading conversations…</p>
        ) : list.isError ? (
          <p role="alert" className="px-4 py-6 text-center text-sm text-muted-foreground">Could not load messages.</p>
        ) : recent.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">No conversations yet.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto py-1">
            {recent.map((c) => (
              <DropdownMenuItem key={c.id} asChild className="cursor-pointer px-4 py-2.5 focus:bg-primary/10">
                <Link to="/chat" search={{ c: c.id }} className="flex items-center gap-3">
                  <ChatAvatar name={conversationName(c)} photo={c.conversation_type === "group" ? null : c.other_photo} group={c.conversation_type === "group"} online={c.other_user_id ? online.has(c.other_user_id) : undefined} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={`truncate text-sm ${c.unread_count ? "font-semibold" : ""}`}>{conversationName(c)}</span>
                      <span className="shrink-0 text-[0.65rem] text-muted-foreground">{shortTime(c.last_message_at)}</span>
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-muted-foreground">{c.last_is_deleted ? "Message deleted" : c.last_message ?? (c.last_message_type ? "Attachment" : "No messages yet")}</span>
                      {c.unread_count > 0 && <span className="shrink-0 rounded-full bg-primary px-1.5 text-[0.6rem] font-bold leading-4 text-primary-foreground">{c.unread_count}</span>}
                    </span>
                  </span>
                </Link>
              </DropdownMenuItem>
            ))}
          </div>
        )}
        <DropdownMenuSeparator className="m-0" />
        <DropdownMenuItem asChild className="cursor-pointer justify-center rounded-none px-4 py-3 text-sm font-semibold text-primary">
          <Link to="/chat">Open Instant Chat</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Sidebar badge; reads the same cached conversation list as the top-bar menu. */
export function ChatNavBadge() {
  const { data } = useQuery({ queryKey: chatKeys.list, queryFn: listConversations, refetchInterval: 90_000 });
  const unread = (data ?? []).filter((c) => c.is_active && !c.is_archived).reduce((n, c) => n + c.unread_count + (c.manual_unread ? 1 : 0), 0);
  if (!unread) return null;
  return <span className="ml-auto rounded-full bg-primary px-1.5 text-[0.65rem] font-bold leading-5 text-primary-foreground">{unread > 99 ? "99+" : unread}</span>;
}
