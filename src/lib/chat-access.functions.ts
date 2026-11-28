import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { setResponseHeader } from '@tanstack/react-start/server';

export const getChatAccess = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    setResponseHeader('Cache-Control', 'no-store');
    const [rolesResult, profileResult] = await Promise.all([
      context.supabase.from('user_roles').select('role').eq('user_id', context.userId),
      context.supabase.from('users').select('status').eq('id', context.userId).maybeSingle(),
    ]);
    if (rolesResult.error || profileResult.error) throw new Error('Could not check chat access.');
    const roles = (rolesResult.data ?? []).map(r => r.role as string);
    const active = profileResult.data?.status === 'active';
    return { userId: context.userId, roles, allowed: active && roles.some(r => ['admin','vendor','landlord'].includes(r)), reason: active ? 'ok' as const : 'suspended' as const };
  });
