import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { readLandlordDashboard } from '../landlord-dashboard.server';
import type { DashboardTransaction } from '../landlord-dashboard';

const connection = process.env['SUPABASE_DB_URL'];
const sql = connection ? postgres(connection, { max: 1, prepare: false }) : null;
const now = new Date('2026-11-13T06:37:00Z');
const landlord = '3fcffa4e-6b2f-449e-b57f-cd5df16b7a5a';

describe.skipIf(!sql)('persisted landlord dashboard reconciliation', () => {
  let actual: Awaited<ReturnType<typeof readLandlordDashboard>>;
  let expected: number[] = [];
  let expectedRecent: string[] = [];

  beforeAll(async () => {
    if (!sql) return;
    // Read-only sample verification is not a hosted-session or RLS acceptance check.
    await sql.begin(async tx => {
      await tx.unsafe('SET TRANSACTION READ ONLY');
      const properties = await tx`select id,name,code,city,address_line1,created_by from properties where id in (select property_id from property_landlords where landlord_id=${landlord} union select id from properties where landlord_id=${landlord})`;
      const propertyIds = properties.map(p => String(p['id']));
      const units = await tx`select id,property_id,unit_number,building,floor,status,electricity_meter_no,water_meter_no,gas_meter_no from units where property_id in ${tx(propertyIds)}`;
      const meters = await tx`select id,meter_number,type,unit_id,vendor_id,status from meters where unit_id in ${tx(units.map(u => String(u['id'])))}`;
      const meterIds = meters.map(m => String(m['id']));
      const records = await tx`select record_id,token_id,bank_notification_id,meter_id,trans_id,txn_at::text,amount_paid,units,token_status,payment_status,bank,action from transaction_records where meter_id in ${tx(meterIds)} and action='credit' order by txn_at desc,record_id,bank_notification_id`;
      const tokens = await tx`select id,provider_state from meter_tokens where meter_id in ${tx(meterIds)}`;
      const banks = await tx`select id,bank,trans_id,status,payment_status from bank_notifications where meter_id in ${tx(meterIds)} or meter_number in ${tx(meters.map(m => String(m['meter_number'])))}`;
      const rpcData = new Map<string, unknown[]>([
        ['landlord_property_ids', propertyIds], ['landlord_unit_ids', units.map(u => u['id'])],
        ['landlord_meter_ids', meterIds], ['landlord_managing_vendors', []],
      ]);
      const tables: Record<string, any[]> = { properties: [...properties], units: [...units], meters: [...meters], transaction_records: [...records], meter_tokens: [...tokens], bank_notifications: [...banks] };
      const db = {
        rpc: (name: string) => name === 'has_role' ? Promise.resolve({ data: true }) : ({ range: async (start: number, end: number) => ({ data: (rpcData.get(name) ?? []).slice(start, end + 1) }) }),
        from: (table: string) => {
          let rows = [...(tables[table] ?? [])];
          const q: any = {
            select: () => q,
            in: (key: string, ids: string[]) => { rows = rows.filter(r => ids.includes(r[key])); return q; },
            eq: (key: string, value: string) => { rows = rows.filter(r => r[key] === value); return q; },
            gte: (key: string, value: string) => { rows = rows.filter(r => Date.parse(r[key]) >= Date.parse(value)); return q; },
            lte: (key: string, value: string) => { rows = rows.filter(r => Date.parse(r[key]) <= Date.parse(value)); return q; },
            order: () => q,
            range: async (start: number, end: number) => ({ data: rows.slice(start, end + 1) }),
          };
          return q;
        },
      };
      actual = await readLandlordDashboard({ supabase: db, userId: landlord }, now);
      const totals = await tx`
        with confirmed as (
          select distinct on(r.token_id) r.token_id,r.txn_at,r.amount_paid
          from transaction_records r join meter_tokens t on t.id=r.token_id
          join meters m on m.id=r.meter_id join units u on u.id=m.unit_id
          left join bank_notifications b on b.id=r.bank_notification_id
          where u.property_id in ${tx(propertyIds)} and r.action='credit'
            and lower(m.type) in('electricity','water','gas') and t.provider_state='successful'
            and r.payment_status='completed' and r.token_status in('generated','revoked','expired')
            and (b.id is null or (b.status not in('pending','rejected','cancelled','reversed','refunded','payment_failed') and (b.bank<>'SIDIAN' or b.payment_status='0')))
            and r.txn_at<=${now.toISOString()}::timestamptz
          order by r.token_id,r.txn_at desc
        ) select
          coalesce(sum(amount_paid) filter(where txn_at>=date_trunc('day',${now.toISOString()}::timestamptz at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi'),0) daily,
          coalesce(sum(amount_paid) filter(where txn_at>=date_trunc('week',${now.toISOString()}::timestamptz at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi'),0) weekly,
          coalesce(sum(amount_paid) filter(where txn_at>=date_trunc('month',${now.toISOString()}::timestamptz at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi'),0) monthly,
          coalesce(sum(amount_paid) filter(where txn_at>=date_trunc('year',${now.toISOString()}::timestamptz at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi'),0) annually from confirmed`;
      const first = totals[0];
      expected = ['daily','weekly','monthly','annually'].map(key => Number(first?.[key] ?? 0));
      expectedRecent = [...records as unknown as DashboardTransaction[]].filter(r => r.token_status === 'generated' && Date.parse(r.txn_at) <= now.getTime()).slice(0, 5).map(r => r.record_id);
    });
  }, 30_000);

  afterAll(async () => { await sql?.end(); });

  it('reconciles Daily with persisted sample payments', () => expect(actual.collections[0]?.total).toBe(expected[0]));
  it('reconciles Weekly with persisted sample payments', () => {
    expect(actual.collections[1]?.total).toBe(expected[1]);
    expect(actual.collections[1]?.total).toBe(2330);
  });
  it('reconciles Monthly with persisted sample payments', () => {
    expect(actual.collections[2]?.total).toBe(expected[2]);
    expect(actual.collections[2]?.total).toBe(8781);
  });
  it('reconciles Annually with persisted sample payments', () => expect(actual.collections[3]?.total).toBe(expected[3]));
  it('returns exactly five latest persisted token records newest first', () => {
    expect(actual.recent).toHaveLength(5);
    expect(actual.recent.map(r => r.record_id)).toEqual(expectedRecent);
    expect(actual.recent[0]?.trans_id).toBe('UKCF81UI0G');
    expect(actual.recent[0]?.property_name).toBe('AP Quarters - Naivasha');
  });
  it('reconciles actual lowercase Electricity meter amounts with the headline total', () => {
    expect(actual.collections[2]?.byType.find(t => t.type === 'Electricity')?.total).toBe(8781);
  });
});