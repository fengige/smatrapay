import { decimalInteger } from './landlord-reporting';

export const landlordDashboardKey = ['landlord-dashboard'] as const;
export const collectionMeterTypes = ['Electricity', 'Water', 'Gas'] as const;
export type CollectionMeterType = (typeof collectionMeterTypes)[number];
export type CollectionPeriod = 'daily' | 'weekly' | 'monthly' | 'annually';

export function collectionMeterType(value: string) {
  return collectionMeterTypes.find(type => type.toLowerCase() === value.trim().toLowerCase());
}

export type DashboardMeter = {
  id: string;
  meter_number: string;
  type: string;
  property_id: string | null;
  property_name: string;
  unit_name: string;
};
export type DashboardTransaction = {
  record_id: string;
  token_id: string | null;
  bank_notification_id: string | null;
  meter_id: string;
  trans_id: string | null;
  txn_at: string;
  amount_paid: number | string | null;
  units: number | string | null;
  token_status: string;
  payment_status: string;
  bank: string | null;
  action: string;
};
export type DashboardTokenState = { id: string; provider_state: string | null };
export type DashboardBankState = {
  id: string;
  bank: string;
  trans_id: string;
  status: string;
  payment_status: string | null;
};
export type DashboardPayment = {
  record_id: string;
  token_id: string | null;
  payment_key: string;
  txn_at: string;
  property_id: string;
  property_name: string;
  unit_name: string;
  meter_number: string;
  meter_type: CollectionMeterType;
  trans_id: string | null;
  amount_paid: number | null;
  units: number | null;
  token_status: string;
};

const localBoundary = (date: Date) => `${date.toISOString().slice(0, 10)}T00:00:00+03:00`;

/** Calendar boundaries are independent of the server/browser's own timezone. */
export function landlordCollectionPeriods(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (name: string) => Number(parts.find(p => p.type === name)?.value);
  const year = part('year');
  const month = part('month') - 1;
  const day = part('day');
  const today = new Date(Date.UTC(year, month, day));
  const monday = day - ((today.getUTCDay() + 6) % 7);
  const range = (from: Date, to: Date) => ({ from: localBoundary(from), to: localBoundary(to) });
  return {
    daily: range(today, new Date(Date.UTC(year, month, day + 1))),
    weekly: range(new Date(Date.UTC(year, month, monday)), new Date(Date.UTC(year, month, monday + 7))),
    monthly: range(new Date(Date.UTC(year, month, 1)), new Date(Date.UTC(year, month + 1, 1))),
    annually: range(new Date(Date.UTC(year, 0, 1)), new Date(Date.UTC(year + 1, 0, 1))),
  };
}

/** Bank status describes delivery; a failed vend does not undo a confirmed payment. */
function confirmedBankPayment(bank: DashboardBankState) {
  if (['pending', 'rejected', 'cancelled', 'reversed', 'refunded', 'payment_failed'].includes(bank.status)) return false;
  if (['pending', 'failed', 'cancelled', 'reversed', 'refunded', 'rejected'].includes(bank.payment_status ?? '')) return false;
  if (bank.bank === 'SIDIAN') return bank.payment_status === '0';
  if (bank.bank === 'NCBA') return ['processing', 'retry_pending', 'needs_review', 'failed', 'completed'].includes(bank.status);
  return ['completed', 'confirmed', 'successful'].includes(bank.payment_status ?? '');
}

/** Reuse transaction_records, but verify its synthetic statuses against persisted source states. */
export function confirmedDashboardPayments(
  rows: DashboardTransaction[], meters: DashboardMeter[],
  tokens: DashboardTokenState[], banks: DashboardBankState[],
): DashboardPayment[] {
  const meterMap = new Map(meters.filter(m => m.property_id).map(m => [m.id, m]));
  const tokenMap = new Map(tokens.map(t => [t.id, t]));
  const bankMap = new Map(banks.map(b => [b.id, b]));
  const seenTokens = new Set<string>();
  const seenPayments = new Set<string>();
  const payments: DashboardPayment[] = [];
  // Prefer a token-backed record if a stale token-less duplicate was also read.
  const candidates = [...rows].sort((a, b) => Number(Boolean(b.token_id)) - Number(Boolean(a.token_id))
    || b.txn_at.localeCompare(a.txn_at) || a.record_id.localeCompare(b.record_id));
  for (const row of candidates) {
    const meter = meterMap.get(row.meter_id);
    const meterType = meter ? collectionMeterType(meter.type) : undefined;
    if (!meter?.property_id || !meterType || row.action !== 'credit') continue;
    const bank = row.bank_notification_id ? bankMap.get(row.bank_notification_id) : undefined;
    if (row.bank_notification_id && (!bank || !confirmedBankPayment(bank))) continue;
    if (row.token_id) {
      const token = tokenMap.get(row.token_id);
      if (!token || token.provider_state !== 'successful' || row.payment_status !== 'completed'
        || !['generated', 'revoked', 'expired'].includes(row.token_status)) continue;
    } else if (!bank) continue;
    const paymentKey = bank ? `bank:${bank.bank}:${bank.trans_id}` : `token:${row.token_id}`;
    if (seenPayments.has(paymentKey) || (row.token_id && seenTokens.has(row.token_id))) continue;
    seenPayments.add(paymentKey);
    if (row.token_id) seenTokens.add(row.token_id);
    payments.push({
      record_id: row.record_id, token_id: row.token_id, payment_key: paymentKey,
      txn_at: row.txn_at, property_id: meter.property_id, property_name: meter.property_name,
      unit_name: meter.unit_name, meter_number: meter.meter_number, meter_type: meterType,
      trans_id: bank?.trans_id ?? row.trans_id,
      amount_paid: row.amount_paid == null ? null : Number(row.amount_paid),
      units: row.units == null ? null : Number(row.units), token_status: row.token_status,
    });
  }
  return payments.sort((a, b) => b.txn_at.localeCompare(a.txn_at) || a.record_id.localeCompare(b.record_id));
}

export function summarizeLandlordCollections(payments: DashboardPayment[], now: Date) {
  const periods = landlordCollectionPeriods(now);
  return (Object.keys(periods) as CollectionPeriod[]).map(key => {
    const period = periods[key];
    const from = Date.parse(period.from);
    const to = Date.parse(period.to);
    const sums: Record<CollectionMeterType, bigint> = { Electricity: 0n, Water: 0n, Gas: 0n };
    const seen = new Set<string>();
    let count = 0;
    for (const payment of payments) {
      const at = Date.parse(payment.txn_at);
      if (at < from || at >= to || at > now.getTime() || !Number.isFinite(at) || seen.has(payment.payment_key)) continue;
      seen.add(payment.payment_key);
      sums[payment.meter_type] += decimalInteger(payment.amount_paid);
      count += 1;
    }
    return {
      key, ...period, count,
      total: Number(sums.Electricity + sums.Water + sums.Gas) / 100,
      byType: collectionMeterTypes.map(type => ({ type, total: Number(sums[type]) / 100 })),
    };
  });
}

export function latestLandlordTokens(payments: DashboardPayment[], now: Date) {
  const seenTokens = new Set<string>();
  const seenPayments = new Set<string>();
  return [...payments].sort((a, b) => Date.parse(b.txn_at) - Date.parse(a.txn_at)
    || a.record_id.localeCompare(b.record_id)).filter(p => {
    if (!p.token_id || p.token_status !== 'generated' || Date.parse(p.txn_at) > now.getTime()
      || seenTokens.has(p.token_id) || seenPayments.has(p.payment_key)) return false;
    seenTokens.add(p.token_id);
    seenPayments.add(p.payment_key);
    return true;
  }).slice(0, 5);
}