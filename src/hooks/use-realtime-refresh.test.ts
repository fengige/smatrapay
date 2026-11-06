import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  callbacks: new Map<string, () => void>(),
  cleanup: undefined as (() => void) | undefined,
  invalidate: vi.fn(), remove: vi.fn(), subscribe: vi.fn(), channelName: '',
}));
vi.mock('react', () => ({ useEffect: (effect: () => (() => void) | undefined) => { state.cleanup = effect(); } }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  channel: (name: string) => {
    state.channelName = name;
    const channel = {
      on: (_event: string, filter: { table: string }, callback: () => void) => { state.callbacks.set(filter.table, callback); return channel; },
      subscribe: state.subscribe,
    };
    return channel;
  },
  removeChannel: state.remove,
} }));
import { useRealtimeRefresh } from './use-realtime-refresh';

describe('landlord live query refresh', () => {
  beforeEach(() => { vi.clearAllMocks(); state.callbacks.clear(); state.cleanup = undefined; });
  const keys = [['landlord-properties'], ['landlord-property'], ['bank-payments', 'landlord']];
  it.each(['units', 'meters', 'properties', 'unit_assignments', 'bank_notifications'])('refreshes scoped property and bank queries after %s changes', (table) => {
    useRealtimeRefresh('landlord', ['units', 'meters', 'properties', 'unit_assignments', 'bank_notifications'], keys);
    const callback = state.callbacks.get(table);
    expect(callback).toBeDefined();
    callback?.();
    expect(state.invalidate.mock.calls).toEqual(keys.map((queryKey) => [{ queryKey }]));
  });
  it('unsubscribes when the page closes', () => {
    useRealtimeRefresh('landlord', ['units'], keys);
    expect(state.subscribe).toHaveBeenCalledTimes(1);
    state.cleanup?.();
    expect(state.remove).toHaveBeenCalledTimes(1);
  });
  it('does not subscribe when landlord mode is disabled', () => {
    useRealtimeRefresh('landlord', ['units'], keys, false);
    expect(state.subscribe).not.toHaveBeenCalled();
  });
  it('gives independently mounted pages unique channels', () => {
    useRealtimeRefresh('landlord', ['units'], keys);
    const first = state.channelName;
    useRealtimeRefresh('landlord', ['units'], keys);
    expect(state.channelName).not.toBe(first);
  });
});