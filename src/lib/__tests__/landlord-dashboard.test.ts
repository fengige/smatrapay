import { describe, expect, it, vi } from 'vitest';
import {
  confirmedDashboardPayments, landlordCollectionPeriods, latestLandlordTokens,
  summarizeLandlordCollections, type DashboardBankState, type DashboardMeter,
  type DashboardPayment, type DashboardTransaction,
} from '../landlord-dashboard';
import { readLandlordDashboard } from '../landlord-dashboard.server';

const now = new Date('2026-11-13T06:37:00Z');
const meter = (patch: Partial<DashboardMeter> = {}): DashboardMeter => ({
  id: 'meter-a', meter_number: '001', type: 'Electricity', property_id: 'property-a',
  property_name: 'First property', unit_name: 'A1', ...patch,
});
const payment = (id: string, at: string, amount: number, patch: Partial<DashboardPayment> = {}): DashboardPayment => ({
  record_id: id, token_id: id, payment_key: id, txn_at: at, amount_paid: amount, units: 1.2345,
  property_id: 'property-a', property_name: 'First property', unit_name: 'A1', meter_number: '001',
  meter_type: 'Electricity', token_status: 'generated', trans_id: id, ...patch,
});
const transaction = (patch: Partial<DashboardTransaction> = {}): DashboardTransaction => ({
  record_id: 'token-a', token_id: 'token-a', bank_notification_id: null, meter_id: 'meter-a',
  trans_id: 'receipt-a', txn_at: now.toISOString(), amount_paid: '100.00', units: '1.2345',
  token_status: 'generated', payment_status: 'completed', bank: null, action: 'credit', ...patch,
});
const bank = (patch: Partial<DashboardBankState> = {}): DashboardBankState => ({
  id: 'bank-a', bank: 'SIDIAN', trans_id: 'receipt-a', status: 'completed', payment_status: '0', ...patch,
});
const periodPayments = [
  payment('previous-year', '2025-12-31T20:59:59.999Z', 9999),
  payment('year-start', '2025-12-31T21:00:00Z', 50),
  payment('last-month', '2026-10-31T20:59:59.999Z', 75),
  payment('month-start', '2026-10-31T21:00:00Z', 100),
  payment('last-week', '2026-11-08T20:59:59.999Z', 200),
  payment('week-start', '2026-11-08T21:00:00Z', 300),
  payment('yesterday', '2026-11-12T20:59:59.999Z', 400),
  payment('today-start', '2026-11-12T21:00:00Z', 500),
  payment('today-water', '2026-11-13T05:00:00Z', 25.1, { meter_type: 'Water', property_id: 'property-b' }),
  payment('today-gas', '2026-11-13T06:00:00Z', 0.2, { meter_type: 'Gas' }),
  payment('future', '2026-11-13T21:00:00Z', 9000),
];
const total = (key: string) => summarizeLandlordCollections(periodPayments, now).find(p => p.key === key)?.total;

describe('landlord collection calendar periods', () => {
  it('Daily counts today from Nairobi midnight, not UTC midnight', () => expect(total('daily')).toBe(525.3));
  it('Weekly counts the current Monday–Sunday week', () => expect(total('weekly')).toBe(1225.3));
  it('Monthly counts the current calendar month', () => expect(total('monthly')).toBe(1525.3));
  it('Annually counts the current calendar year', () => expect(total('annually')).toBe(1650.3));
  it('keeps Electricity, Water and Gas totals separately reconciled', () => {
    const daily = summarizeLandlordCollections(periodPayments, now).find(p => p.key === 'daily');
    expect(daily?.byType).toEqual([{ type: 'Electricity', total: 500 }, { type: 'Water', total: 25.1 }, { type: 'Gas', total: 0.2 }]);
    expect(daily?.count).toBe(3);
  });
  it('does not double count a retried payment', () => {
    expect(summarizeLandlordCollections([periodPayments[7], periodPayments[7]].filter((p): p is DashboardPayment => Boolean(p)), now)[0]?.total).toBe(500);
  });
  it('excludes future dates inside the current month/year', () => expect(total('annually')).toBe(1650.3));
  it('handles a current week crossing the calendar year', () => {
    const january = new Date('2027-01-01T12:00:00Z');
    const periods = landlordCollectionPeriods(january);
    expect(periods.weekly.from).toBe('2026-12-28T00:00:00+03:00');
    expect(periods.weekly.to).toBe('2027-01-04T00:00:00+03:00');
    const result = summarizeLandlordCollections([payment('december', '2026-12-29T12:00:00Z', 50), payment('january', '2027-01-01T08:00:00Z', 100)], january);
    expect(result.find(p => p.key === 'weekly')?.total).toBe(150);
    expect(result.find(p => p.key === 'annually')?.total).toBe(100);
  });
  it('uses Nairobi rollover even when UTC is still the previous year', () => {
    expect(landlordCollectionPeriods(new Date('2026-12-31T22:00:00Z')).daily.from).toBe('2027-01-01T00:00:00+03:00');
  });
  it('uses complete leap-year calendar month boundaries', () => {
    expect(landlordCollectionPeriods(new Date('2024-02-29T12:00:00Z')).monthly).toEqual({ from: '2024-02-01T00:00:00+03:00', to: '2024-03-01T00:00:00+03:00' });
  });
});

describe('persisted payment confirmation and landlord scope', () => {
  it.each(['pending', 'failed', 'cancelled', 'reversed', 'refunded'])('excludes %s token payment transactions', status => {
    expect(confirmedDashboardPayments([transaction({ payment_status: status })], [meter()], [{ id: 'token-a', provider_state: 'successful' }], [])).toEqual([]);
  });
  it.each(['pending', 'failed', 'reversed', 'cancelled', 'review'])('excludes %s provider results despite synthetic completed view status', status => {
    expect(confirmedDashboardPayments([transaction()], [meter()], [{ id: 'token-a', provider_state: status }], [])).toEqual([]);
  });
  it.each(['pending', 'rejected', 'cancelled', 'reversed', 'refunded', 'payment_failed'])('excludes %s bank payments even if a token exists', status => {
    expect(confirmedDashboardPayments([transaction({ bank_notification_id: 'bank-a' })], [meter()], [{ id: 'token-a', provider_state: 'successful' }], [bank({ status })])).toEqual([]);
  });
  it('excludes unconfirmed Sidian callbacks', () => {
    expect(confirmedDashboardPayments([transaction({ bank_notification_id: 'bank-a' })], [meter()], [{ id: 'token-a', provider_state: 'successful' }], [bank({ payment_status: '1' })])).toEqual([]);
  });
  it.each(['pending', 'failed', 'cancelled', 'reversed', 'refunded'])('excludes an NCBA %s payment state despite a completed delivery state', status => {
    expect(confirmedDashboardPayments([transaction({ bank_notification_id: 'bank-a' })], [meter()], [{ id: 'token-a', provider_state: 'successful' }], [bank({ bank: 'NCBA', payment_status: status })])).toEqual([]);
  });
  it('counts confirmed money when token delivery fails without inventing token units', () => {
    const rows = confirmedDashboardPayments([transaction({ token_id: null, bank_notification_id: 'bank-a', token_status: 'failed', payment_status: 'received', units: null })], [meter()], [], [bank({ status: 'failed' })]);
    expect(summarizeLandlordCollections(rows, now)[0]?.total).toBe(100);
    expect(latestLandlordTokens(rows, now)).toEqual([]);
  });
  it('counts accepted NCBA payments waiting for vending', () => {
    const rows = confirmedDashboardPayments([transaction({ token_id: null, bank_notification_id: 'bank-a', payment_status: 'received', token_status: 'pending' })], [meter()], [], [bank({ bank: 'NCBA', status: 'retry_pending', payment_status: null })]);
    expect(summarizeLandlordCollections(rows, now)[0]?.total).toBe(100);
  });
  it('keeps revoked/expired successful purchases in collections: token revocation is not a payment reversal', () => {
    const rows = confirmedDashboardPayments([transaction({ token_status: 'revoked' })], [meter()], [{ id: 'token-a', provider_state: 'successful' }], []);
    expect(summarizeLandlordCollections(rows, now)[0]?.total).toBe(100);
    expect(latestLandlordTokens(rows, now)).toEqual([]);
  });
  it('deduplicates token joins, callback records, and a stale token-less copy', () => {
    const rows = confirmedDashboardPayments([
      transaction({ bank_notification_id: 'bank-a' }),
      transaction({ bank_notification_id: 'bank-a' }),
      transaction({ record_id: 'bank-a', token_id: null, bank_notification_id: 'bank-a', token_status: 'pending', payment_status: 'received' }),
    ], [meter()], [{ id: 'token-a', provider_state: 'successful' }], [bank()]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.token_id).toBe('token-a');
    expect(summarizeLandlordCollections(rows, now)[0]?.total).toBe(100);
  });
  it('includes multiple managing vendors but denies foreign or unlinked property meters', () => {
    const rows = confirmedDashboardPayments([
      transaction(), transaction({ record_id: 'token-b', token_id: 'token-b', meter_id: 'meter-b' }),
      transaction({ record_id: 'foreign', token_id: 'foreign', meter_id: 'foreign-meter' }),
      transaction({ record_id: 'unlinked', token_id: 'unlinked', meter_id: 'unlinked-meter' }),
    ], [meter(), meter({ id: 'meter-b', property_id: 'property-b', property_name: 'Other vendor property' }), meter({ id: 'unlinked-meter', property_id: null })], ['token-a', 'token-b', 'foreign', 'unlinked'].map(id => ({ id, provider_state: 'successful' })), []);
    expect(rows.map(r => r.property_id).sort()).toEqual(['property-a', 'property-b']);
    expect(summarizeLandlordCollections(rows, now)[0]?.total).toBe(200);
  });
  it('excludes maintenance tokens instead of treating them as collections', () => {
    expect(confirmedDashboardPayments([transaction({ action: 'clear_credit' })], [meter()], [{ id: 'token-a', provider_state: 'successful' }], [])).toEqual([]);
  });
  it.each(['electricity', 'water', 'gas'])('includes saved lowercase %s meter types', type => {
    const rows = confirmedDashboardPayments([transaction()], [meter({ type })], [{ id: 'token-a', provider_state: 'successful' }], []);
    expect(summarizeLandlordCollections(rows, now)[0]?.total).toBe(100);
    expect(rows[0]?.meter_type).toBe(type.charAt(0).toUpperCase() + type.slice(1));
  });
  it('returns only useful transaction details, without supplier or provider configuration', () => {
    const rows = confirmedDashboardPayments([transaction()], [meter()], [{ id: 'token-a', provider_state: 'successful' }], []);
    expect(rows[0]).toMatchObject({ property_name: 'First property', unit_name: 'A1', meter_number: '001', amount_paid: 100, units: 1.2345 });
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(['amount_paid','meter_number','meter_type','payment_key','property_id','property_name','record_id','token_id','token_status','trans_id','txn_at','unit_name','units'].sort());
  });
});

describe('latest five successful tokens', () => {
  it('orders newest first and returns exactly five when more exist', () => {
    const rows = Array.from({ length: 7 }, (_, index) => payment(String(index), `2026-11-13T0${index}:00:00Z`, 100));
    expect(latestLandlordTokens(rows.reverse(), now).map(r => r.record_id)).toEqual(['6', '5', '4', '3', '2']);
  });
  it.each([0, 1, 4, 5])('returns only available records when %i successful tokens exist', count => {
    expect(latestLandlordTokens(Array.from({ length: count }, (_, index) => payment(String(index), now.toISOString(), 100)), now)).toHaveLength(count);
  });
  it('uses a stable transaction ID tie-break and excludes retries, failed and token-less records', () => {
    const a = payment('a', now.toISOString(), 100);
    expect(latestLandlordTokens([payment('z', now.toISOString(), 100), a, a, payment('failure', now.toISOString(), 200, { token_status: 'failed' }), payment('no-token', now.toISOString(), 300, { token_id: null })], now).map(r => r.record_id)).toEqual(['a', 'z']);
  });
  it('returns older-year tokens when no recent payments exist', () => {
    expect(latestLandlordTokens([payment('old', '2025-01-01T12:00:00Z', 100)], now)[0]?.record_id).toBe('old');
  });
});

function databaseFixture(count = 1206, oldOnly = false) {
  const calls: { table: string; ids: string[]; end: number }[] = [];
  const meters = Array.from({ length: 1403 }, (_, i) => ({ id: `meter-${i}`, meter_number: String(i), type: i % 2 ? 'Water' : 'Electricity', unit_id: `unit-${i}`, vendor_id: i % 2 ? 'vendor-b' : 'vendor-a' }));
  const units = meters.map((m, i) => ({ id: m.unit_id, unit_number: String(i), property_id: i % 2 ? 'property-b' : 'property-a' }));
  const transactions = meters.slice(0, count).map((m, i) => transaction({ record_id: `token-${i}`, token_id: `token-${i}`, meter_id: m.id, amount_paid: '0.10', txn_at: oldOnly ? '2025-01-01T12:00:00Z' : new Date(now.getTime() - i * 1000).toISOString() }));
  transactions.push(transaction({ record_id: 'foreign', token_id: 'foreign', meter_id: 'foreign-meter', amount_paid: '9999.00' }));
  const tables: Record<string, any[]> = {
    properties: [{ id: 'property-a', name: 'First property', created_by: 'vendor-a' }, { id: 'property-b', name: 'Other vendor property', created_by: 'vendor-b' }],
    meters, units, transaction_records: transactions,
    meter_tokens: transactions.map(t => ({ id: t.token_id, provider_state: 'successful' })), bank_notifications: [],
  };
  const db = {
    rpc: vi.fn((name: string) => name === 'has_role' ? Promise.resolve({ data: true }) : ({ range: async (start: number, end: number) => ({ data: (name === 'landlord_property_ids' ? ['property-a','property-b'] : name === 'landlord_unit_ids' ? units.map(u => u.id) : name === 'landlord_meter_ids' ? meters.map(m => m.id) : [{ id: 'vendor-a', name: 'Vendor A' },{ id: 'vendor-b', name: 'Vendor B' }]).slice(start, end + 1) }) })),
    from: (table: string) => {
      let rows = [...(tables[table] ?? [])];
      let allowed: string[] = [];
      const q: any = {
        select: () => q,
        in: (key: string, ids: string[]) => { allowed = ids; rows = rows.filter(r => ids.includes(r[key])); return q; },
        eq: (key: string, value: string) => { rows = rows.filter(r => r[key] === value); return q; },
        gte: (key: string, value: string) => { rows = rows.filter(r => Date.parse(r[key]) >= Date.parse(value)); return q; },
        lte: (key: string, value: string) => { rows = rows.filter(r => Date.parse(r[key]) <= Date.parse(value)); return q; },
        order: () => q,
        range: async (start: number, end: number) => { calls.push({ table, ids: allowed, end }); return { data: rows.slice(start, end + 1) }; },
      };
      return q;
    },
  };
  return { db, calls };
}

describe('landlord dashboard complete scoped server reads', () => {
  it('sums more than 1000 records across 1403 meters with bounded requests and no foreign payments', async () => {
    const { db, calls } = databaseFixture();
    const data = await readLandlordDashboard({ supabase: db, userId: 'landlord' }, now);
    expect(data.collections.map(p => p.total)).toEqual([120.6, 120.6, 120.6, 120.6]);
    expect(data.collections[0]?.count).toBe(1206);
    expect(data.propertyCount).toBe(2);
    expect(data.recent.map(r => r.record_id)).toEqual(['token-0','token-1','token-2','token-3','token-4']);
    expect(Math.max(...calls.map(c => c.ids.length))).toBe(200);
  });
  it('does not limit the recent list to this year or the collection period', async () => {
    const { db } = databaseFixture(7, true);
    const data = await readLandlordDashboard({ supabase: db, userId: 'landlord' }, now);
    expect(data.collections.map(p => p.total)).toEqual([0, 0, 0, 0]);
    expect(data.recent).toHaveLength(5);
    expect(data.recent.every(r => r.txn_at.startsWith('2025'))).toBe(true);
  });
  it('rejects a non-landlord session before transaction reads', async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: false }), from: vi.fn() };
    await expect(readLandlordDashboard({ supabase: db, userId: 'vendor' }, now)).rejects.toThrow('Landlord access required');
    expect(db.from).not.toHaveBeenCalled();
  });
  it('propagates data errors rather than silently displaying zero collections', async () => {
    const { db } = databaseFixture(7);
    const baseFrom = db.from;
    db.from = (table: string) => {
      const q = baseFrom(table);
      if (table === 'transaction_records') q.range = async () => ({ data: null, error: { message: 'Payment read unavailable' } });
      return q;
    };
    await expect(readLandlordDashboard({ supabase: db, userId: 'landlord' }, now)).rejects.toThrow('Payment read unavailable');
  });
});