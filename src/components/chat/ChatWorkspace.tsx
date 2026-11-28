import { useEffect, useRef, useState, Fragment } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ArrowUp, Check, CheckCheck, ChevronDown, Copy, Edit, FileSearch, Forward, Info, Loader2, MessageSquare, MoreHorizontal, Paperclip, Plus, Reply, Search, Send, Settings, Smile, Trash2, Users, X, Pin, BellOff, Archive, Flag, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { DashboardShell } from '@/components/DashboardShell';
import { ChatAvatar } from './ChatAvatar';
import { ChatSettingsDialog, FileLink, ForwardDialog, GroupDetailsSheet, MessageInfoDialog, NewChatDialog, NewGroupDialog, ReportDialog } from './ChatDialogs';
import { useOnlineUsers } from '@/hooks/use-chat';
import { attachmentUrl, chatKeys, deleteMessage, editMessage, fetchMessages, getConversation, listConversations, listMembers, markRead, MESSAGE_PAGE, mySuspension, privateChatContext, searchMessages, sendMessage, setFlag, startPrivateChat, uploadAttachment, type ChatMessage, type ChatConversation } from '@/lib/chat-client';
import { buildTimeline, CHAT_ACCEPT, CHAT_MAX_MESSAGE_LENGTH, chatRoleLabel, conversationName, filterConversations, formatBytes, friendlyChatError, messageStatus, nextChatHistoryCursor, QUICK_EMOJIS, shortTime, validateChatFile, type ChatFilter, type ChatHistoryCursor } from '@/lib/chat';

const api = getRouteApi('/_authenticated/chat');

function ImageAttachment({ path, name }: { path: string; name: string | null }) {
  const query = useQuery({ queryKey: ['chat', 'attachment-url', path], queryFn: () => attachmentUrl(path), staleTime: 500_000 });
  if (!query.data) return <span className="block py-5 text-xs text-muted-foreground">{query.isError ? 'Image unavailable' : 'Loading image…'}</span>;
  return <a href={query.data} target="_blank" rel="noopener noreferrer"><img src={query.data} alt={name ?? 'Shared image'} loading="lazy" className="max-h-64 w-full rounded-md object-contain" /></a>;
}

function StatusIcon({ message }: { message: ChatMessage }) {
  const status = messageStatus(message.receipts);
  return <span title={status} aria-label={status} className={status === 'read' ? 'text-success' : 'text-muted-foreground'}>{status === 'sent' ? <Check className="size-3.5" /> : <CheckCheck className="size-3.5" />}</span>;
}

export function ChatWorkspace() {
  const access = api.useLoaderData();
  return <DashboardShell access={access} title="Instant Chat" description="Conversations with your property partners" hideHeading>{access.allowed && <ChatContent userId={access.userId} isAdmin={access.roles.includes('admin')} />}</DashboardShell>;
}

function ChatContent({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const searchState = api.useSearch();
  const navigate = useNavigate({ from: '/chat' });
  const qc = useQueryClient();
  const id = searchState.c ?? '';
  const [filter, setFilter] = useState<ChatFilter>('all');
  const [query, setQuery] = useState('');
  const [newChat, setNewChat] = useState(false);
  const [newGroup, setNewGroup] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [details, setDetails] = useState(false);
  const [text, setText] = useState('');
  const [reply, setReply] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [forward, setForward] = useState<ChatMessage | null>(null);
  const [report, setReport] = useState<ChatMessage | null>(null);
  const [info, setInfo] = useState<ChatMessage | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const [messageSearch, setMessageSearch] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [filesOnly, setFilesOnly] = useState(false);
  const [typing, setTyping] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const room = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<string | null>(null);
  const online = useOnlineUsers();
  const list = useQuery({ queryKey: chatKeys.list, queryFn: listConversations, refetchInterval: 90_000 });
  const suspension = useQuery({ queryKey: chatKeys.suspension, queryFn: () => mySuspension(userId) });
  const conversationQuery = useQuery({ queryKey: chatKeys.conversation(id), queryFn: () => getConversation(id), enabled: !!id });
  const membersQuery = useQuery({ queryKey: chatKeys.members(id), queryFn: () => listMembers(id), enabled: !!id });
  const members = membersQuery.data ?? [];
  const current = list.data?.find(c => c.id === id) ?? null;
  const ownParticipant = members.find(m => m.user_id === userId);
  const writable = !!current?.is_active && !suspension.data;
  const title = current ? conversationName(current) : conversationQuery.data?.title ?? 'Conversation';
  const privateContext = useQuery({ queryKey: ['chat', 'private-context', id], queryFn: () => privateChatContext(id), enabled: !!id });
  const timelineQuery = useInfiniteQuery({
    queryKey: [...chatKeys.messages(id), privateContext.data?.cleared_at ?? null],
    queryFn: ({ pageParam }) => fetchMessages(id, pageParam, privateContext.data?.cleared_at ?? null),
    initialPageParam: null as ChatHistoryCursor | null,
    getNextPageParam: page => nextChatHistoryCursor(page, MESSAGE_PAGE),
    enabled: !!id && privateContext.isSuccess,
    refetchInterval: 60_000,
  });
  const messages = (timelineQuery.data?.pages.flat() ?? []).slice().reverse();
  const timeline = buildTimeline(messages);
  const openConversation = (c: string) => void navigate({ to: '/chat', search: { c } });
  const refresh = () => qc.invalidateQueries({ queryKey: chatKeys.all });
  const start = useMutation({ mutationFn: startPrivateChat, onSuccess: async c => { await refresh(); openConversation(c); }, onError: e => toast.error(friendlyChatError(e)) });
  useEffect(() => {
    if (searchState.new === 'chat') setNewChat(true);
    if (searchState.new === 'group' && isAdmin) setNewGroup(true);
    if (searchState.u && startRef.current !== searchState.u) { startRef.current = searchState.u; start.mutate(searchState.u); }
  }, [searchState.new, searchState.u, isAdmin]);
  useEffect(() => { setText(''); setFile(null); setEditing(null); setReply(null); setDetails(false); setMessageSearch(false); setFailed(false); }, [id]);
  useEffect(() => {
    if (!id || !writable || document.visibilityState !== 'visible' || !document.hasFocus()) return;
    void markRead(id).then(() => qc.invalidateQueries({ queryKey: chatKeys.list })).catch(() => undefined);
  }, [id, messages.at(-1)?.id, writable, qc]);
  useEffect(() => {
    const read = () => { if (id && writable && document.visibilityState === 'visible') void markRead(id).then(() => qc.invalidateQueries({ queryKey: chatKeys.list })).catch(() => undefined); };
    window.addEventListener('focus', read); document.addEventListener('visibilitychange', read);
    return () => { window.removeEventListener('focus', read); document.removeEventListener('visibilitychange', read); };
  }, [id, writable, qc]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end', behavior: 'instant' }); }, [id, messages.at(-1)?.id]);
  useEffect(() => {
    setTyping([]);
    if (!id || !ownParticipant?.is_active) return;
    const channel = supabase.channel(`chat:conv:${id}`, { config: { private: true, presence: { key: userId } } });
    room.current = channel;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    channel.on('broadcast', { event: 'typing' }, event => {
      const payload = event['payload'] as { user_id?: string; typing?: boolean };
      const who = payload.user_id;
      if (!who || who === userId || !members.some(m => m.user_id === who && m.is_active)) return;
      clearTimeout(timers.get(who));
      setTyping(prev => payload.typing ? [...new Set([...prev, who])] : prev.filter(x => x !== who));
      timers.set(who, setTimeout(() => setTyping(prev => prev.filter(x => x !== who)), 5000));
    }).subscribe();
    return () => { timers.forEach(clearTimeout); room.current = null; void supabase.removeChannel(channel); };
  }, [id, userId, ownParticipant?.is_active, membersQuery.data]);
  useEffect(() => {
    if (!id || !writable) return;
    const update = () => {
      const visible = document.visibilityState === 'visible' && document.hasFocus();
      void supabase.rpc('chat_viewing', { p_conversation: id, p_visible: visible });
    };
    update();
    const heartbeat = setInterval(update, 20000);
    window.addEventListener('focus', update); window.addEventListener('blur', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(heartbeat); window.removeEventListener('focus', update); window.removeEventListener('blur', update);
      document.removeEventListener('visibilitychange', update);
      void supabase.rpc('chat_viewing', { p_conversation: id, p_visible: false });
    };
  }, [id, writable]);
  const emitTyping = () => {
    if (!writable || !room.current) return;
    if (!typingTimer.current) void room.current.send({ type: 'broadcast', event: 'typing', payload: { user_id: userId, typing: true } });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => { void room.current?.send({ type: 'broadcast', event: 'typing', payload: { user_id: userId, typing: false } }); typingTimer.current = null; }, 1800);
  };
  const send = useMutation({
    mutationFn: async () => {
      if (!id || !writable) throw new Error('Messaging is not available.');
      if (editing) { await editMessage(editing.id, text); return; }
      let attachment = null;
      if (file) { setProgress(0); attachment = await uploadAttachment(id, userId, file, setProgress); }
      await sendMessage({ conversationId: id, text, replyTo: reply?.id ?? null, attachment });
    },
    onSuccess: () => { setText(''); setFile(null); setReply(null); setEditing(null); setFailed(false); void refresh(); },
    onError: e => { setFailed(true); toast.error(friendlyChatError(e)); },
  });
  const remove = useMutation({ mutationFn: deleteMessage, onSuccess: refresh, onError: e => toast.error(friendlyChatError(e)) });
  const flag = useMutation({ mutationFn: (v: { flag: 'pinned'|'muted'|'archived'|'unread'|'cleared'; value: boolean }) => setFlag(id, v.flag, v.value), onSuccess: (_d, v) => { void refresh(); if (v.flag === 'unread' || v.flag === 'archived' || v.flag === 'cleared') void navigate({ to:'/chat', search:{} }); }, onError: e => toast.error(friendlyChatError(e)) });
  const selectFile = (f?: File) => { if (!f) return; const error = validateChatFile(f); if (error) toast.error(error); else setFile(f); };
  const searched = useQuery({ queryKey: ['chat','search',id,keyword,from,to,filesOnly], queryFn: () => searchMessages({ conversationIds: (list.data ?? []).map(c=>c.id), q: keyword, ...(id ? { conversationId: id } : {}), ...(from ? { from: new Date(`${from}T00:00:00+03:00`).toISOString() } : {}), ...(to ? { to: new Date(new Date(`${to}T00:00:00+03:00`).getTime()+86400000).toISOString() } : {}), attachmentsOnly:filesOnly }), enabled: messageSearch && !!(keyword || from || to || filesOnly) });
  const visible = filterConversations(list.data ?? [], filter, query);
  const nameOf = (who: string) => members.find(m => m.user_id === who)?.name ?? 'Member';

  return <div className="chat-workspace flex min-h-0 overflow-hidden rounded-lg border border-border bg-card">
    <section aria-label="Conversations" className={`${id ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col border-r border-border md:w-72 xl:w-80`}>
      <div className="flex items-center justify-between px-4 py-4"><h1 className="text-lg font-bold">Messages</h1><div className="flex gap-1"><Button variant="ghost" size="icon" aria-label="Chat notification settings" onClick={()=>setSettingsOpen(true)}><Settings /></Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="New conversation"><Plus /></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem onSelect={()=>setNewChat(true)}>New chat</DropdownMenuItem>{isAdmin && <DropdownMenuItem onSelect={()=>setNewGroup(true)}>New group</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu></div></div>
      <div className="space-y-3 px-3 pb-3"><div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search conversations" aria-label="Search conversations" value={query} onChange={e=>setQuery(e.target.value)} /></div><div className="flex gap-1 overflow-x-auto pb-1">{(['all','unread','vendor','landlord','group','archived'] as ChatFilter[]).map(f=><Button key={f} size="sm" variant={filter===f?'secondary':'ghost'} className="h-7 shrink-0 px-2 text-xs" onClick={()=>setFilter(f)}>{({all:'All',unread:'Unread',vendor:'Vendors',landlord:'Landlords',group:'Groups',archived:'Archived'})[f]}</Button>)}</div></div>
      <div className="min-h-0 flex-1 overflow-y-auto">{list.isLoading ? <div className="space-y-4 p-4">{[1,2,3,4].map(n=><Skeleton key={n} className="h-14" />)}</div> : list.isError ? <div className="p-5 text-sm"><p role="alert">Could not load conversations.</p><Button variant="outline" size="sm" onClick={()=>void list.refetch()}>Retry</Button></div> : !visible.length ? <div className="px-6 py-12 text-center"><MessageSquare className="mx-auto mb-3 size-8 text-accent" /><p className="text-sm text-muted-foreground">{query ? 'No conversations found.' : 'No conversations yet.'}</p><Button variant="outline" className="mt-4" onClick={()=>setNewChat(true)}><Plus />Start a chat</Button></div> : visible.map(c=><Button key={c.id} variant="ghost" onClick={()=>openConversation(c.id)} className={`h-auto w-full justify-start gap-3 rounded-none px-3 py-3 ${id===c.id?'bg-accent/10':''}`}><ChatAvatar name={conversationName(c)} photo={c.other_photo} group={c.conversation_type==='group'} {...(c.other_user_id ? { online: online.has(c.other_user_id) } : {})} /><span className="min-w-0 flex-1 text-left"><span className="flex justify-between gap-2"><span className="truncate font-semibold">{conversationName(c)}</span><span className="shrink-0 text-[0.65rem] text-muted-foreground">{shortTime(c.last_message_at)}</span></span><span className="block text-[0.65rem] text-muted-foreground">{c.conversation_type==='group'?`${c.member_count} members`:chatRoleLabel(c.other_role)}</span><span className="mt-0.5 flex justify-between gap-2"><span className="truncate text-xs text-muted-foreground">{c.last_is_deleted?'Message deleted':c.last_message??(c.last_message_type?'Attachment':'Say hello')}</span><span className="flex shrink-0 items-center gap-1">{c.is_pinned&&<Pin className="size-3 text-muted-foreground" />}{c.is_muted&&<BellOff className="size-3 text-muted-foreground" />}{(c.unread_count>0||c.manual_unread)&&<span className="rounded-full bg-primary px-1.5 text-[0.65rem] text-primary-foreground">{c.unread_count||'•'}</span>}</span></span></span></Button>)}</div>
      <div className="border-t border-border p-3"><Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={()=>{setMessageSearch(true);setKeyword('');}}><FileSearch />Search message history</Button></div>
    </section>
    <section aria-label="Chat window" className={`${id || messageSearch ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
      {!id && !messageSearch ? <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center"><span className="rounded-full bg-accent/10 p-5"><MessageSquare className="size-10 text-accent" /></span><h2 className="text-xl font-semibold">Your conversations</h2><p className="text-sm text-muted-foreground">Select a chat or start a new conversation.</p><Button onClick={()=>setNewChat(true)}><Plus />New chat</Button></div> : <>
        <header className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-3"><Button variant="ghost" size="icon" className="md:hidden" aria-label="Back to conversations" onClick={()=>{void navigate({to:'/chat',search:{}});setMessageSearch(false);}}><ArrowLeft /></Button><ChatAvatar name={title} photo={current?.other_photo} group={current?.conversation_type==='group'} size="sm" /><Button variant="ghost" className="h-auto min-w-0 flex-1 justify-start p-0 text-left" onClick={()=>setDetails(true)}><span className="min-w-0"><span className="block truncate font-semibold">{id?title:'Search messages'}</span><span className="block text-xs font-normal text-muted-foreground">{current?.conversation_type==='group'?`${current.member_count} members`: current?.other_user_id && online.has(current.other_user_id)?'Online': current?.other_last_seen?`Last seen ${shortTime(current.other_last_seen)}`:chatRoleLabel(current?.other_role)}</span></span></Button><Button size="icon" variant="ghost" aria-label="Search in conversation" onClick={()=>setMessageSearch(v=>!v)}><Search /></Button>{id&&<DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label="Conversation actions"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={()=>setDetails(true)}><Info />Conversation details</DropdownMenuItem><DropdownMenuItem onSelect={()=>flag.mutate({flag:'pinned',value:!current?.is_pinned})}><Pin />{current?.is_pinned?'Unpin':'Pin'} conversation</DropdownMenuItem><DropdownMenuItem onSelect={()=>flag.mutate({flag:'muted',value:!current?.is_muted})}><BellOff />{current?.is_muted?'Unmute':'Mute'} conversation</DropdownMenuItem><DropdownMenuItem onSelect={()=>flag.mutate({flag:'unread',value:true})}>Mark as unread</DropdownMenuItem><DropdownMenuItem onSelect={()=>flag.mutate({flag:'archived',value:!current?.is_archived})}><Archive />{current?.is_archived?'Unarchive':'Archive'}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onSelect={()=>{if(window.confirm('Hide all messages sent before now on your account? Other members keep their history.'))flag.mutate({flag:'cleared',value:true});}}>Clear my history</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}</header>
        {messageSearch ? <div className="min-h-0 flex-1 overflow-y-auto p-4"><div className="mb-4 flex gap-2"><Input autoFocus aria-label="Message keywords" placeholder="Search messages" value={keyword} onChange={e=>setKeyword(e.target.value)} /><Button size="icon" variant="ghost" aria-label="Close message search" onClick={()=>setMessageSearch(false)}><X /></Button></div><div className="mb-4 grid grid-cols-2 gap-2"><label className="text-xs text-muted-foreground">From<Input type="date" value={from} onChange={e=>setFrom(e.target.value)} /></label><label className="text-xs text-muted-foreground">To<Input type="date" value={to} onChange={e=>setTo(e.target.value)} /></label></div><label className="mb-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={filesOnly} onChange={e=>setFilesOnly(e.target.checked)} />With attachments</label>{searched.isFetching?<p className="text-sm text-muted-foreground">Searching…</p>:searched.data?.map(m=><Button key={m.id} variant="ghost" className="mb-2 h-auto w-full justify-start whitespace-normal border border-border p-3 text-left" onClick={()=>{openConversation(m.conversation_id);setMessageSearch(false);toast.info(`Message from ${new Date(m.created_at).toLocaleDateString('en-KE')}`);}}><span><span className="block text-xs text-muted-foreground">{shortTime(m.created_at)}</span><span className="block break-words">{m.message??m.attachment_name}</span></span></Button>)}{searched.isSuccess&&!searched.data?.length&&<p className="text-sm text-muted-foreground">No messages found.</p>}</div> : <>
          <div ref={scroller} className="chat-wash min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();selectFile(e.dataTransfer.files[0]);}}>
            {timelineQuery.hasNextPage&&<div className="mb-4 text-center"><Button variant="outline" size="sm" disabled={timelineQuery.isFetchingNextPage} onClick={async()=>{const el=scroller.current;const height=el?.scrollHeight??0;await timelineQuery.fetchNextPage();requestAnimationFrame(()=>{if(el)el.scrollTop+=el.scrollHeight-height;});}}>{timelineQuery.isFetchingNextPage?<Loader2 className="animate-spin" />:<ArrowUp />}Older messages</Button></div>}
            {timelineQuery.isLoading?<div className="space-y-4">{[1,2,3].map(n=><Skeleton key={n} className={`h-16 w-2/3 ${n%2?'':'ml-auto'}`} />)}</div>:timelineQuery.isError?<div role="alert" className="text-center text-sm"><p>Could not load messages.</p><Button variant="outline" onClick={()=>void timelineQuery.refetch()}>Retry</Button></div>:!messages.length?<p className="py-10 text-center text-sm text-muted-foreground">No messages yet. Send the first one.</p>:timeline.map(entry=>entry.kind==='day'?<div key={entry.key} className="my-5 text-center"><span className="rounded-full bg-background/80 px-3 py-1 text-[0.7rem] font-medium text-muted-foreground">{entry.label}</span></div>:<Fragment key={entry.key}>{entry.message.message_type==='system'?<p className="my-3 text-center text-xs text-muted-foreground">{entry.message.message}</p>:<div className={`group flex ${entry.message.sender_id===userId?'justify-end':'justify-start'} ${entry.firstInGroup?'mt-4':'mt-1'}`}><div className={`min-w-0 max-w-[88%] rounded-lg px-3 py-2 sm:max-w-[75%] ${entry.message.sender_id===userId?'bg-chat-sent':'bg-chat-received'}`}>
              {entry.firstInGroup&&current?.conversation_type==='group'&&entry.message.sender_id!==userId&&<p className="mb-1 text-xs font-semibold text-primary">{nameOf(entry.message.sender_id)}</p>}
              {entry.message.forwarded_from_message_id&&<p className="mb-1 text-xs italic text-muted-foreground">Forwarded</p>}
              {entry.message.reply_to_message_id&&<div className="mb-2 border-l-2 border-accent bg-background/40 px-2 py-1 text-xs text-muted-foreground">{messages.find(m=>m.id===entry.message.reply_to_message_id)?.message??'Reply to an earlier message'}</div>}
              {entry.message.is_deleted?<p className="text-sm italic text-muted-foreground">This message was deleted.</p>:<>{entry.message.attachment_path&&<div className="mb-2">{entry.message.message_type==='image'&&<ImageAttachment path={entry.message.attachment_path} name={entry.message.attachment_name} />}<FileLink path={entry.message.attachment_path} name={entry.message.attachment_name} size={entry.message.attachment_size} /></div>}{entry.message.message&&<p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{entry.message.message}</p>}</>}
              <div className="mt-1 flex items-center justify-end gap-1.5"><span className="text-[0.6rem] text-muted-foreground">{entry.message.is_edited?'edited · ':''}{new Date(entry.message.created_at).toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'})}</span>{entry.message.sender_id===userId&&<StatusIcon message={entry.message} />}{!entry.message.is_deleted&&<DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="size-5" aria-label="Message actions"><ChevronDown className="size-3" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={()=>setReply(entry.message)}><Reply />Reply</DropdownMenuItem><DropdownMenuItem onSelect={()=>setForward(entry.message)}><Forward />Forward</DropdownMenuItem>{entry.message.message&&<DropdownMenuItem onSelect={()=>void navigator.clipboard.writeText(entry.message.message??'')}><Copy />Copy</DropdownMenuItem>}{entry.message.sender_id===userId&&<><DropdownMenuItem onSelect={()=>{setEditing(entry.message);setText(entry.message.message??'');setFile(null);}}><Edit />Edit</DropdownMenuItem><DropdownMenuItem onSelect={()=>setInfo(entry.message)}><Info />Message info</DropdownMenuItem></>}{(entry.message.sender_id===userId||isAdmin)&&<DropdownMenuItem className="text-destructive" onSelect={()=>{if(window.confirm('Delete this message for everyone?'))remove.mutate(entry.message.id);}}><Trash2 />Delete</DropdownMenuItem>}{entry.message.sender_id!==userId&&<DropdownMenuItem onSelect={()=>setReport(entry.message)}><Flag />Report</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu>}</div>
            </div></div>}</Fragment>)}
            {typing.length>0&&<p role="status" className="mt-3 text-xs text-muted-foreground">{typing.map(nameOf).join(', ')} {typing.length===1?'is':'are'} typing…</p>}<div ref={bottom} />
          </div>
          {!writable?<div className="border-t border-border px-4 py-4 text-center text-sm text-muted-foreground">{suspension.data?'Your messaging access is suspended. Contact the administrator.':ownParticipant?'You are no longer a member of this conversation.':'This conversation is read-only.'}</div>:<form className="shrink-0 border-t border-border bg-background p-3" onSubmit={e=>{e.preventDefault();if(!send.isPending&&(text.trim()||file))send.mutate();}}>
            {(reply||editing)&&<div className="mb-2 flex items-center justify-between gap-2 border-l-2 border-accent bg-muted px-3 py-2"><span className="min-w-0"><span className="block text-xs font-semibold text-primary">{editing?'Editing message':`Replying to ${nameOf(reply?.sender_id??'')}`}</span><span className="block truncate text-xs text-muted-foreground">{editing?.message??reply?.message??'Attachment'}</span></span><Button type="button" size="icon" variant="ghost" className="size-6" aria-label="Cancel reply or edit" onClick={()=>{setReply(null);setEditing(null);setText('');}}><X /></Button></div>}
            {file&&<div className="mb-2 flex items-center gap-2 rounded-md bg-muted px-3 py-2"><Paperclip className="size-4" /><span className="min-w-0 flex-1 truncate text-xs">{file.name} · {formatBytes(file.size)}{send.isPending?` · Uploading ${progress}%`:''}</span><Button type="button" size="icon" variant="ghost" className="size-6" aria-label="Remove attachment" disabled={send.isPending} onClick={()=>setFile(null)}><X /></Button></div>}
            {failed&&<p role="alert" className="mb-2 flex items-center gap-1 text-xs text-destructive"><AlertCircle className="size-3" />Message failed. Your draft is saved below; send again to retry.</p>}
            <div className="flex items-end gap-1.5"><input ref={input} type="file" accept={CHAT_ACCEPT} className="hidden" onChange={e=>{selectFile(e.target.files?.[0]);e.target.value='';}} /><Button type="button" variant="ghost" size="icon" aria-label="Attach a file" disabled={send.isPending||!!editing} onClick={()=>input.current?.click()}><Paperclip /></Button><Popover><PopoverTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label="Emoji"><Smile /></Button></PopoverTrigger><PopoverContent className="grid w-64 grid-cols-8 gap-1 p-2">{QUICK_EMOJIS.map(emoji=><Button key={emoji} variant="ghost" size="icon" className="size-7" onClick={()=>setText(v=>v+emoji)}>{emoji}</Button>)}</PopoverContent></Popover><Textarea rows={1} maxLength={CHAT_MAX_MESSAGE_LENGTH} aria-label="Message" placeholder="Type a message…" value={text} onChange={e=>{setText(e.target.value);emitTyping();}} disabled={send.isPending} className="max-h-32 min-h-10 flex-1 resize-none" onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();if((text.trim()||file)&&!send.isPending)send.mutate();}}} /><Button type="submit" size="icon" aria-label={editing?'Save message':'Send message'} disabled={send.isPending||(!text.trim()&&!file)}>{send.isPending?<Loader2 className="animate-spin" />:<Send />}</Button></div>
          </form>}
        </>}
      </>}
    </section>
    <NewChatDialog open={newChat} onOpenChange={setNewChat} onOpened={openConversation} isAdmin={isAdmin} />{isAdmin&&<NewGroupDialog open={newGroup} onOpenChange={setNewGroup} onOpened={openConversation} />}<ChatSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} userId={userId} /><GroupDetailsSheet open={details} onOpenChange={setDetails} conversation={current} members={members} userId={userId} isAdmin={isAdmin} onLeft={()=>void navigate({to:'/chat',search:{}})} /><ForwardDialog message={forward} conversations={list.data??[]} onOpenChange={v=>{if(!v)setForward(null);}} /><ReportDialog message={report} onOpenChange={v=>{if(!v)setReport(null);}} /><MessageInfoDialog message={info} members={members} onOpenChange={v=>{if(!v)setInfo(null);}} />
  </div>;
}
