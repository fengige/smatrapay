import { createFileRoute } from '@tanstack/react-router';
import { getChatAccess } from '@/lib/chat-access.functions';
import { ChatAdministration } from '@/components/chat/ChatAdministration';
export const Route=createFileRoute('/_authenticated/admin/chat')({
  head:()=>({meta:[{title:'Chat Administration · SmatraPay'},{name:'description',content:'Messaging activity, groups, reports and audited moderation in SmatraPay.'},{property:'og:title',content:'Chat Administration · SmatraPay'},{property:'og:description',content:'Administrator messaging oversight and access management.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),
  loader:()=>getChatAccess(), component:ChatAdministration,
  errorComponent:()=> <p role="alert" className="p-8 text-destructive">Could not load chat administration.</p>,
  notFoundComponent:()=> <p className="p-8">Chat administration not found.</p>,
});
