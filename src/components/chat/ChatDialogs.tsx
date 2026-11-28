import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Download, FileText, Loader2, LogOut, Search, ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChatAvatar } from "./ChatAvatar";
import { useOnlineUsers } from "@/hooks/use-chat";
import {
  attachmentUrl, chatKeys, createGroup, directory, getSettings, listMembers, manageMember, reportMessage, saveSettings,
  sendMessage, sharedFiles, startPrivateChat, updateGroup, uploadAttachment, type ChatConversation, type ChatMember, type ChatMessage,
} from "@/lib/chat-client";
import { chatRoleLabel, conversationName, formatBytes, friendlyChatError } from "@/lib/chat";

function useDebounced(value: string, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

function DirectoryList({ search, selected, onPick, multi }: { search: string; selected?: Set<string>; onPick: (p: { id: string; name: string }) => void; multi?: boolean }) {
  const online = useOnlineUsers();
  const q = useDebounced(search);
  const { data, isLoading, isError } = useQuery({ queryKey: ["chat", "directory", q], queryFn: () => directory(q) });
  if (isLoading) return <p role="status" className="py-6 text-center text-sm text-muted-foreground">Searching…</p>;
  if (isError) return <p role="alert" className="py-6 text-center text-sm text-destructive">Could not load people.</p>;
  if (!data?.length) return <p className="py-6 text-center text-sm text-muted-foreground">No one found.</p>;
  return (
    <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-xl border border-border">
      {data.map((p) => (
        <li key={p.id}>
          <button type="button" onClick={() => onPick(p)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-hidden">
            {multi && <Checkbox checked={selected?.has(p.id) ?? false} tabIndex={-1} aria-hidden />}
            <ChatAvatar name={p.name} photo={p.profile_image} online={online.has(p.id)} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{p.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{chatRoleLabel(p.chat_role)}{p.email ? ` · ${p.email}` : ""}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function NewChatDialog({ open, onOpenChange, onOpened, isAdmin }: { open: boolean; onOpenChange: (v: boolean) => void; onOpened: (id: string) => void; isAdmin: boolean }) {
  const [search, setSearch] = useState("");
  const qc = useQueryClient();
  const start = useMutation({
    mutationFn: (id: string) => startPrivateChat(id),
    onSuccess: async (id) => { await qc.invalidateQueries({ queryKey: chatKeys.list }); onOpenChange(false); onOpened(id); },
    onError: (e) => toast.error(friendlyChatError(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New chat</DialogTitle>
          <DialogDescription>{isAdmin ? "Search for a vendor or landlord to message." : "Start a private conversation with the administrator."}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email" className="pl-9" aria-label="Search people" />
        </div>
        {start.isPending ? <p role="status" className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Opening chat…</p> : <DirectoryList search={search} onPick={(p) => start.mutate(p.id)} />}
      </DialogContent>
    </Dialog>
  );
}

export function NewGroupDialog({ open, onOpenChange, onOpened }: { open: boolean; onOpenChange: (v: boolean) => void; onOpened: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [search, setSearch] = useState("");
  const [members, setMembers] = useState<Map<string, string>>(new Map());
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: () => createGroup(title, description, [...members.keys()]),
    onSuccess: async (id) => {
      await qc.invalidateQueries({ queryKey: chatKeys.list });
      toast.success("Group created");
      onOpenChange(false); setTitle(""); setDescription(""); setMembers(new Map());
      onOpened(id);
    },
    onError: (e) => toast.error(friendlyChatError(e)),
  });
  const toggle = (p: { id: string; name: string }) => setMembers((prev) => { const n = new Map(prev); if (n.has(p.id)) n.delete(p.id); else n.set(p.id, p.name); return n; });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New group</DialogTitle>
          <DialogDescription>Create a group with vendors and landlords for announcements and discussions.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <div className="space-y-1.5"><Label htmlFor="group-name">Group name</Label><Input id="group-name" required minLength={2} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="group-desc">Description (optional)</Label><Textarea id="group-desc" maxLength={1000} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label htmlFor="group-search">Members ({members.size} selected)</Label>
            {members.size > 0 && <div className="flex flex-wrap gap-1.5">{[...members].map(([id, name]) => <button type="button" key={id} onClick={() => toggle({ id, name })} className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/20">{name} ×</button>)}</div>}
            <Input id="group-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vendors and landlords" />
            <DirectoryList search={search} selected={new Set(members.keys())} onPick={toggle} multi />
          </div>
          <DialogFooter><Button type="submit" disabled={create.isPending || members.size === 0 || title.trim().length < 2}>{create.isPending && <Loader2 className="animate-spin" />}Create group</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function FileLink({ path, name, size }: { path: string; name: string | null; size: number | null }) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { window.open(await attachmentUrl(path, name ?? "file"), "_blank", "noopener"); } catch (e) { toast.error(friendlyChatError(e)); } finally { setBusy(false); } }}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-background/60 px-3 py-2 text-left hover:bg-muted">
      <FileText className="size-5 shrink-0 text-primary" />
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{name ?? "File"}</span><span className="block text-xs text-muted-foreground">{formatBytes(size)}</span></span>
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4 text-muted-foreground" />}
    </button>
  );
}

export function GroupDetailsSheet({ open, onOpenChange, conversation, members, userId, isAdmin, onLeft }: {
  open: boolean; onOpenChange: (v: boolean) => void; conversation: ChatConversation | null; members: ChatMember[]; userId: string; isAdmin: boolean; onLeft: () => void;
}) {
  const qc = useQueryClient();
  const online = useOnlineUsers();
  const id = conversation?.id ?? "";
  const isGroup = conversation?.conversation_type === "group";
  const me = members.find((m) => m.user_id === userId);
  const canEdit = isGroup && (isAdmin || me?.member_role === "owner" || me?.member_role === "moderator");
  const [title, setTitle] = useState(conversation?.title ?? "");
  const [description, setDescription] = useState(conversation?.description ?? "");
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const photoInput = useRef<HTMLInputElement>(null);
  useEffect(() => { setTitle(conversation?.title ?? ""); setDescription(conversation?.description ?? ""); }, [conversation?.title, conversation?.description]);
  const files = useQuery({ queryKey: chatKeys.files(id), queryFn: () => sharedFiles(id), enabled: open && !!id });
  const photo = useQuery({ queryKey: ["chat", "photo", conversation?.group_photo], queryFn: () => conversation?.group_photo ? attachmentUrl(conversation.group_photo) : Promise.resolve(null), enabled: !!conversation?.group_photo });
  const refresh = () => qc.invalidateQueries({ queryKey: chatKeys.all });
  const save = useMutation({ mutationFn: (p: string | null) => updateGroup(id, title, description, p), onSuccess: () => { toast.success("Group updated"); void refresh(); }, onError: (e) => toast.error(friendlyChatError(e)) });
  const member = useMutation({ mutationFn: (v: { user: string; action: "add" | "remove" | "leave" | "moderator" | "member" }) => manageMember(id, v.user, v.action),
    onSuccess: (_d, v) => { void refresh(); if (v.action === "leave") { onOpenChange(false); onLeft(); } }, onError: (e) => toast.error(friendlyChatError(e)) });
  const active = members.filter((m) => m.is_active);
  if (!conversation) return null;
  const name = conversationName(conversation);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isGroup ? "Group details" : "Conversation details"}</SheetTitle>
          <SheetDescription>{isGroup ? `${active.length} members` : chatRoleLabel(conversation.other_role)}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 flex flex-col items-center gap-2 text-center">
          <div className="relative">
            {photo.data ? <img src={photo.data} alt="" className="size-20 rounded-full object-cover" /> : <ChatAvatar name={name} photo={isGroup ? null : conversation.other_photo} group={isGroup} size="lg" />}
            {canEdit && (
              <>
                <button type="button" aria-label="Change group photo" onClick={() => photoInput.current?.click()} className="absolute -bottom-1 -right-1 rounded-full bg-primary p-1.5 text-primary-foreground shadow"><Camera className="size-3.5" /></button>
                <input ref={photoInput} type="file" accept="image/*" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0]; e.target.value = "";
                  if (!file) return;
                  if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) { toast.error("Choose an image under 5 MB."); return; }
                  try { const up = await uploadAttachment(id, userId, file, () => undefined); save.mutate(up.path); } catch (err) { toast.error(friendlyChatError(err)); }
                }} />
              </>
            )}
          </div>
          <p className="text-lg font-semibold">{name}</p>
          {conversation.description && <p className="text-sm text-muted-foreground">{conversation.description}</p>}
        </div>
        <Tabs defaultValue={isGroup ? "members" : "files"} className="mt-4">
          <TabsList className="w-full">
            {isGroup && <TabsTrigger value="members" className="flex-1">Members</TabsTrigger>}
            {canEdit && <TabsTrigger value="settings" className="flex-1">Settings</TabsTrigger>}
            <TabsTrigger value="files" className="flex-1">Files</TabsTrigger>
          </TabsList>
          {isGroup && (
            <TabsContent value="members" className="space-y-3">
              {isAdmin && (adding ? (
                <div className="space-y-2">
                  <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vendors and landlords" aria-label="Search people to add" />
                  <DirectoryList search={search} onPick={(p) => { member.mutate({ user: p.id, action: "add" }); setAdding(false); setSearch(""); }} />
                  <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
                </div>
              ) : <Button variant="outline" size="sm" onClick={() => setAdding(true)}><UserPlus />Add participant</Button>)}
              <ul className="divide-y divide-border">
                {active.map((m) => (
                  <li key={m.user_id} className="flex items-center gap-3 py-2.5">
                    <ChatAvatar name={m.name} photo={m.profile_image} online={online.has(m.user_id)} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{m.name}{m.user_id === userId ? " (you)" : ""}</span>
                      <span className="block text-xs text-muted-foreground">{chatRoleLabel(m.chat_role)}{m.member_role !== "member" ? " · Group admin" : ""}</span>
                    </span>
                    {isAdmin && m.user_id !== userId && m.member_role !== "owner" && (
                      <span className="flex shrink-0 gap-1">
                        <Button size="icon" variant="ghost" className="size-8" aria-label={m.member_role === "moderator" ? `Remove ${m.name} as group admin` : `Make ${m.name} group admin`} onClick={() => member.mutate({ user: m.user_id, action: m.member_role === "moderator" ? "member" : "moderator" })}><ShieldCheck className={m.member_role === "moderator" ? "text-primary" : ""} /></Button>
                        <Button size="icon" variant="ghost" className="size-8" aria-label={`Remove ${m.name}`} onClick={() => member.mutate({ user: m.user_id, action: "remove" })}><UserMinus /></Button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {me?.is_active && me.member_role !== "owner" && <Button variant="outline" className="w-full text-destructive" onClick={() => member.mutate({ user: userId, action: "leave" })}><LogOut />Leave group</Button>}
            </TabsContent>
          )}
          {canEdit && (
            <TabsContent value="settings">
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(null); }}>
                <div className="space-y-1.5"><Label htmlFor="edit-group-name">Group name</Label><Input id="edit-group-name" minLength={2} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
                <div className="space-y-1.5"><Label htmlFor="edit-group-desc">Description</Label><Textarea id="edit-group-desc" maxLength={1000} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
                <Button type="submit" disabled={save.isPending}>{save.isPending && <Loader2 className="animate-spin" />}Save changes</Button>
              </form>
            </TabsContent>
          )}
          <TabsContent value="files" className="space-y-2">
            {files.isLoading ? <p role="status" className="text-sm text-muted-foreground">Loading files…</p> : !files.data?.length ? <p className="py-6 text-center text-sm text-muted-foreground">No shared files yet.</p> : files.data.map((f) => <FileLink key={f.id} path={f.attachment_path ?? ""} name={f.attachment_name} size={f.attachment_size} />)}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

export function ChatSettingsDialog({ open, onOpenChange, userId }: { open: boolean; onOpenChange: (v: boolean) => void; userId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: chatKeys.settings, queryFn: () => getSettings(userId), enabled: open });
  const save = useMutation({ mutationFn: (patch: Parameters<typeof saveSettings>[1]) => saveSettings(userId, patch), onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.settings }), onError: (e) => toast.error(friendlyChatError(e)) });
  const s = { notifications_enabled: true, sound_enabled: true, browser_enabled: false, email_enabled: false, email_delay_minutes: 30, quiet_start: null as string | null, quiet_end: null as string | null, ...(data ?? {}) };
  const row = (id: string, label: string, hint: string, checked: boolean, onChange: (v: boolean) => void) => (
    <div className="flex items-start justify-between gap-4 py-2">
      <div><Label htmlFor={id}>{label}</Label><p className="text-xs text-muted-foreground">{hint}</p></div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Chat notifications</DialogTitle><DialogDescription>Choose how you're alerted about new messages.</DialogDescription></DialogHeader>
        <div className="divide-y divide-border">
          {row("n-app", "Chat notifications", "Show new messages in your notifications.", s.notifications_enabled, (v) => save.mutate({ notifications_enabled: v }))}
          {row("n-sound", "Notification sound", "Play a short sound when a message arrives.", s.sound_enabled, (v) => save.mutate({ sound_enabled: v }))}
          {row("n-browser", "Browser pop-ups", "Show a pop-up when this tab is in the background.", s.browser_enabled, async (v) => {
            if (v && "Notification" in window && Notification.permission !== "granted") {
              const result = await Notification.requestPermission();
              if (result !== "granted") { toast.error("Your browser blocked notifications. Allow them in your browser settings."); return; }
            }
            save.mutate({ browser_enabled: v });
          })}
          {row("n-email", "Email reminders", "Email me about messages I haven't read (sending starts once the email sender is verified).", s.email_enabled, (v) => save.mutate({ email_enabled: v }))}
          <div className="grid grid-cols-2 gap-3 py-3">
            <div className="col-span-2"><p className="text-sm font-medium">Quiet hours</p><p className="text-xs text-muted-foreground">No sounds or pop-ups during these hours.</p></div>
            <div className="space-y-1"><Label htmlFor="q-start">From</Label><Input id="q-start" type="time" value={s.quiet_start?.slice(0, 5) ?? ""} onChange={(e) => save.mutate({ quiet_start: e.target.value || null })} /></div>
            <div className="space-y-1"><Label htmlFor="q-end">To</Label><Input id="q-end" type="time" value={s.quiet_end?.slice(0, 5) ?? ""} onChange={(e) => save.mutate({ quiet_end: e.target.value || null })} /></div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ForwardDialog({ message, conversations, onOpenChange }: { message: ChatMessage | null; conversations: ChatConversation[]; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const targets = useMemo(() => conversations.filter((c) => c.is_active && conversationName(c).toLowerCase().includes(search.toLowerCase())), [conversations, search]);
  const forward = useMutation({ mutationFn: (id: string) => sendMessage({ conversationId: id, text: "", forwardFrom: message?.id ?? null }), onSuccess: () => { toast.success("Message forwarded"); void qc.invalidateQueries({ queryKey: chatKeys.all }); onOpenChange(false); }, onError: (e) => toast.error(friendlyChatError(e)) });
  return (
    <Dialog open={!!message} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Forward message</DialogTitle><DialogDescription>Choose a conversation.</DialogDescription></DialogHeader>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations" aria-label="Search conversations" />
        <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-xl border border-border">
          {targets.map((c) => (
            <li key={c.id}><button type="button" disabled={forward.isPending} onClick={() => forward.mutate(c.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted">
              <ChatAvatar name={conversationName(c)} photo={c.other_photo} group={c.conversation_type === "group"} size="sm" /><span className="truncate text-sm">{conversationName(c)}</span>
            </button></li>
          ))}
          {targets.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">No conversations.</li>}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export function ReportDialog({ message, onOpenChange }: { message: ChatMessage | null; onOpenChange: (v: boolean) => void }) {
  const [reason, setReason] = useState("");
  const report = useMutation({ mutationFn: () => message ? reportMessage(message.id, reason) : Promise.reject(new Error("No message selected")), onSuccess: () => { toast.success("Thanks — the administrator will review this message."); setReason(""); onOpenChange(false); }, onError: (e) => toast.error(friendlyChatError(e)) });
  return (
    <Dialog open={!!message} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Report message</DialogTitle><DialogDescription>Tell the administrator what's wrong with this message.</DialogDescription></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); report.mutate(); }}>
          <Textarea required minLength={3} maxLength={500} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason" placeholder="Reason" />
          <DialogFooter><Button type="submit" disabled={report.isPending || reason.trim().length < 3}>Send report</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MessageInfoDialog({ message, members, onOpenChange }: { message: ChatMessage | null; members: ChatMember[]; onOpenChange: (v: boolean) => void }) {
  const name = (id: string) => members.find((m) => m.user_id === id)?.name ?? "Member";
  const fmt = (v: string | null) => (v ? new Date(v).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" }) : "—");
  return (
    <Dialog open={!!message} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Message info</DialogTitle><DialogDescription>Sent {fmt(message?.created_at ?? null)}</DialogDescription></DialogHeader>
        <ul className="max-h-80 divide-y divide-border overflow-y-auto">
          {(message?.receipts ?? []).map((r) => (
            <li key={r.user_id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 py-2 text-sm">
              <span className="truncate font-medium">{name(r.user_id)}</span>
              <span className="text-right text-xs text-muted-foreground">Delivered {fmt(r.delivered_at)}<br />Read {fmt(r.read_at)}</span>
            </li>
          ))}
          {(message?.receipts ?? []).length === 0 && <li className="py-4 text-sm text-muted-foreground">No recipients.</li>}
        </ul>
      </DialogContent>
    </Dialog>
  );
}


