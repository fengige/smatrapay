import { createFileRoute } from '@tanstack/react-router';
import { ChatWorkspace } from '@/components/chat/ChatWorkspace';
import { getChatAccess } from '@/lib/chat-access.functions';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const Route = createFileRoute('/_authenticated/chat')({
  validateSearch: (raw: Record<string, unknown>): { c?: string; u?: string; new?: string } => ({
    ...(typeof raw['c'] === 'string' && uuid.test(raw['c']) ? { c: raw['c'] } : {}),
    ...(typeof raw['u'] === 'string' && uuid.test(raw['u']) ? { u: raw['u'] } : {}),
    ...(raw['new'] === 'chat' || raw['new'] === 'group' ? { new: raw['new'] } : {}),
  }),
  head: () => ({ meta: [
    { title: 'Instant Chat · SmatraPay' }, { name: 'description', content: 'Private property conversations, messages and shared documents in SmatraPay.' },
    { property: 'og:title', content: 'Instant Chat · SmatraPay' }, { property: 'og:description', content: 'Secure conversations for administrators, vendors and landlords.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
  ] }),
  loader: () => getChatAccess(),
  component: ChatWorkspace,
  errorComponent: () => <p role="alert" className="p-8 text-destructive">Could not open chat. Please reload and try again.</p>,
  notFoundComponent: () => <p className="p-8">Conversation not found.</p>,
});
