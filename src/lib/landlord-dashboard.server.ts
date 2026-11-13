import { landlordScope, readScopedIds } from './landlord-scope.server';
import {
  confirmedDashboardPayments, landlordCollectionPeriods, latestLandlordTokens,
  summarizeLandlordCollections, type DashboardTransaction, type DashboardMeter,
  type DashboardPayment,
} from './landlord-dashboard';

const columns = 'record_id,token_id,bank_notification_id,meter_id,trans_id,txn_at,amount_paid,units,token_status,payment_status,bank,action';

async function confirmRows(db: any, rows: DashboardTransaction[], meters: DashboardMeter[]) {
  const [tokens, banks] = await Promise.all([
    readScopedIds(rows.flatMap(r => r.token_id ? [r.token_id] : []),
      ids => db.from('meter_tokens').select('id,provider_state').in('id', ids).order('id')),
    readScopedIds(rows.flatMap(r => r.bank_notification_id ? [r.bank_notification_id] : []),
      ids => db.from('bank_notifications').select('id,bank,trans_id,status,payment_status').in('id', ids).order('id')),
  ]);
  return confirmedDashboardPayments(rows, meters, tokens, banks);
}

/** Read the latest eligible records per bounded meter batch, including older years. */
async function readRecentTokens(db: any, ids: string[], meters: DashboardMeter[], now: Date) {
  const candidates: DashboardPayment[] = [];
  for (let offset = 0; offset < ids.length; offset += 200) {
    const batch = ids.slice(offset, offset + 200);
    const payments: DashboardPayment[] = [];
    for (let start = 0; ; start += 25) {
      const { data, error } = await db.from('transaction_records').select(columns)
        .in('meter_id', batch).eq('action', 'credit').eq('token_status', 'generated')
        .lte('txn_at', now.toISOString()).order('txn_at', { ascending: false })
        .order('record_id').order('bank_notification_id').range(start, start + 24);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as DashboardTransaction[];
      payments.push(...await confirmRows(db, rows, meters));
      const recent = latestLandlordTokens(payments, now);
      if (recent.length >= 5 || rows.length < 25) {
        candidates.push(...recent);
        break;
      }
    }
  }
  return latestLandlordTokens(candidates, now);
}

export async function readLandlordDashboard(context: { supabase: any; userId: string }, now = new Date()) {
  const scope = await landlordScope(context);
  return readCollectionDashboard(context.supabase, scope.meters, scope.properties.length, now);
}

/** Shared collection summary for any caller-authorized meter list. */
export async function readCollectionDashboard(db: any, scopeMeters: DashboardMeter[], propertyCount: number, now = new Date()) {
  const context = { supabase: db };
  const meters: DashboardMeter[] = scopeMeters.filter(m => m.property_id);
  const ids = [...new Set(meters.map(m => m.id))];
  const periods = landlordCollectionPeriods(now);
  // Early January's current week can begin in the preceding calendar year.
  const from = Object.values(periods).map(p => p.from).sort()[0];
  const [raw, recent] = await Promise.all([
    readScopedIds(ids, batch => context.supabase.from('transaction_records').select(columns)
      .in('meter_id', batch).eq('action', 'credit').gte('txn_at', from)
      .lte('txn_at', now.toISOString()).order('txn_at', { ascending: false })
      .order('record_id').order('bank_notification_id')),
    readRecentTokens(context.supabase, ids, meters, now),
  ]);
  const payments = await confirmRows(context.supabase, raw, meters);
  return {
    collections: summarizeLandlordCollections(payments, now), recent,
    propertyCount, updatedAt: now.toISOString(),
  };
}