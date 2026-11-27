import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { chatKeys, markDelivered, unreadTotal } from "@/lib/chat-client";

/** Signed-in user id from the browser session. */
export function useChatUserId() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) setId(data.session?.user.id ?? null); });
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setId(session?.user.id ?? null));
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  return id;
}

// --- Presence (one shared room per page) ---
let online = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function useOnlineUsers() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => online,
    () => online,
  );
}

/**
 * Joins the presence room and the user's private doorbell topic once per page.
 * Each ring refreshes chat queries; reconnects refetch because missed rings are not replayed.
 */
export function useChatRealtime(userId: string | null, onRing?: (event: string, conversationId: string | null) => void) {
  const queryClient = useQueryClient();
  const onRingRef = useRingRef(onRing);
  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void queryClient.invalidateQueries({ queryKey: chatKeys.all }), 150);
    };
    let subscribedOnce = false;
    const doorbell = supabase.channel(`chat:user:${userId}`, { config: { private: true } })
      .on("broadcast", { event: "*" }, (payload) => {
        const conversationId = (payload.payload as { conversation_id?: string } | undefined)?.conversation_id ?? null;
        refresh();
        if (payload.event === "message") void markDelivered().catch(() => undefined);
        onRingRef.current?.(payload.event, conversationId);
      })
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        if (subscribedOnce) refresh();
        subscribedOnce = true;
      });
    const presence = supabase.channel("chat:presence", { config: { private: true, presence: { key: userId } } });
    presence
      .on("presence", { event: "sync" }, () => {
        online = new Set(Object.keys(presence.presenceState()));
        emit();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void presence.track({ at: Date.now() });
      });
    void markDelivered().catch(() => undefined);
    const beat = setInterval(() => void markDelivered().catch(() => undefined), 120_000);
    return () => {
      clearTimeout(timer);
      clearInterval(beat);
      void supabase.removeChannel(doorbell);
      void supabase.removeChannel(presence);
      online = new Set();
      emit();
    };
  }, [userId, queryClient, onRingRef]);
}

function useRingRef<T>(value: T) {
  const [ref] = useState(() => ({ current: value }));
  ref.current = value;
  return ref;
}

export function useChatUnread(enabled: boolean) {
  return useQuery({
    queryKey: chatKeys.unread,
    queryFn: unreadTotal,
    enabled,
    refetchInterval: 60_000,
  });
}
