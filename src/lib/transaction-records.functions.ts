import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Admin access required");
}

const SORTS = ["txn_at", "bank", "trans_id", "meter_number", "owner_name", "amount_paid", "units", "token_status", "payment_status"] as const;

const schema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  q: z.string().max(100).default(""),
  bank: z.string().max(50).default(""),
  transId: z.string().max(100).default(""),
  meter: z.string().max(100).default(""),
  owner: z.string().max(100).default(""),
  ownerType: z.enum(["all", "vendor", "landlord", "agent"]).default("all"),
  software: z.string().max(100).default(""),
  tokenStatus: z.string().max(30).default(""),
  paymentStatus: z.string().max(30).default(""),
  smsStatus: z.string().max(30).default(""),
  minAmount: z.number().nullable().default(null),
  maxAmount: z.number().nullable().default(null),
  sort: z.enum(SORTS).default("txn_at"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});
export type TxnSearch = z.input<typeof schema>;

export type TxnRecord = {
  record_id: string;
  token_id: string | null;
  bank_notification_id: string | null;
  txn_at: string;
  bank: string | null;
  trans_id: string | null;
  meter_number: string | null;
  owner_name: string | null;
  owner_type: string | null;
  amount_paid: number | null;
  commission_amount: number | null;
  vat_on_commission_amount: number | null;
  tokenizable_amount: number | null;
  units: number | null;
  tariff: number | null;
  vending_software: string | null;
  token: string | null;
  action: string | null;
  token_status: string;
  payment_status: string;
  sms_status: string;
  mobile: string | null;
  sms_at: string | null;
  provider_reference: string | null;
  error_message: string | null;
};

const COLS = "record_id, token_id, bank_notification_id, txn_at, bank, trans_id, meter_number, owner_name, owner_type, amount_paid, commission_amount, vat_on_commission_amount, tokenizable_amount, units, tariff, vending_software, token, action, token_status, payment_status, sms_status, mobile, sms_at, provider_reference, error_message";

const clean = (s: string) => s.replace(/[%,()*\\]/g, " ").trim();

function build(supabase: any, select: string, f: z.output<typeof schema>, opts?: any, meterIds?: string[] | null) {
  // Dates are Nairobi days (UTC+3), both ends inclusive.
  let q = supabase.from("transaction_records").select(select, opts)
    .gte("txn_at", `${f.from}T00:00:00+03:00`).lte("txn_at", `${f.to}T23:59:59.999+03:00`);
  if (meterIds) q = q.in("meter_id", meterIds.length ? meterIds : ["00000000-0000-0000-0000-000000000000"]);
  if (f.bank) q = q.eq("bank", f.bank);
  if (clean(f.transId)) q = q.ilike("trans_id", `%${clean(f.transId)}%`);
  if (clean(f.meter)) q = q.ilike("meter_number", `%${clean(f.meter)}%`);
  if (clean(f.owner)) q = q.ilike("owner_name", `%${clean(f.owner)}%`);
  if (f.ownerType !== "all") q = q.eq("owner_type", f.ownerType);
  if (f.software) q = q.eq("vending_software", f.software);
  if (f.tokenStatus) q = q.eq("token_status", f.tokenStatus);
  if (f.paymentStatus) q = q.eq("payment_status", f.paymentStatus);
  if (f.smsStatus) q = q.eq("sms_status", f.smsStatus);
  if (f.minAmount != null) q = q.gte("amount_paid", f.minAmount);
  if (f.maxAmount != null) q = q.lte("amount_paid", f.maxAmount);
  const g = clean(f.q);
  if (g) {
    const p = `%${g}%`;
    q = q.or(`meter_number.ilike.${p},trans_id.ilike.${p},owner_name.ilike.${p},token.ilike.${p},bank.ilike.${p}`);
  }
  return q;
}

const num = (v: any) => (v == null ? null : Number(v));
function mapRow(r: any): TxnRecord {
  return {
    ...r,
    amount_paid: num(r.amount_paid), commission_amount: num(r.commission_amount),
    vat_on_commission_amount: num(r.vat_on_commission_amount), tokenizable_amount: num(r.tokenizable_amount),
    units: num(r.units), tariff: num(r.tariff),
  };
}

/** Sum stored decimal values as integer cents / ten-thousandths to avoid float drift. */
export function summarize(rows: { amount_paid: any; commission_amount: any; vat_on_commission_amount: any; units: any; token_status: string; token_id: string | null }[]) {
  let paid = 0, comm = 0, vat = 0, units = 0, ok = 0, failed = 0, tokens = 0;
  for (const r of rows) {
    paid += Math.round(Number(r.amount_paid ?? 0) * 100);
    comm += Math.round(Number(r.commission_amount ?? 0) * 100);
    vat += Math.round(Number(r.vat_on_commission_amount ?? 0) * 100);
    units += Math.round(Number(r.units ?? 0) * 10000);
    if (r.token_status === "generated") ok += 1;
    if (r.token_status === "failed") failed += 1;
    if (r.token_id) tokens += 1;
  }
  return { total: rows.length, successful: ok, failed, amount_paid: paid / 100, commission: comm / 100, vat: vat / 100, units: units / 10000, tokens };
}

const listInput = (d: unknown) => schema.extend({
  page: z.number().int().min(1).max(100000).default(1),
  pageSize: z.number().int().refine((n) => [25, 50, 100, 200].includes(n)).default(50),
}).parse(d);

async function runList(supabase: any, data: ReturnType<typeof listInput>, meterIds: string[] | null) {
  const start = (data.page - 1) * data.pageSize;
  const { data: rows, error, count } = await build(supabase, COLS, data, { count: "exact" }, meterIds)
    .order(data.sort, { ascending: data.dir === "asc", nullsFirst: false })
    .order("record_id")
    .range(start, start + data.pageSize - 1);
  if (error) throw new Error(error.message);
  // Summary over the whole filtered set, computed server-side from minimal columns.
  const agg: any[] = [];
  for (let s = 0; s < 100000; s += 1000) {
    const { data: part, error: e2 } = await build(supabase, "record_id, token_id, amount_paid, commission_amount, vat_on_commission_amount, units, token_status, bank, vending_software", data, undefined, meterIds)
      .order("record_id").range(s, s + 999);
    if (e2) throw new Error(e2.message);
    agg.push(...(part ?? []));
    if (!part || part.length < 1000) break;
  }
  let bankOptions: string[]; let softwareOptions: string[];
  if (meterIds) {
    bankOptions = [...new Set<string>(agg.map((r) => r.bank).filter(Boolean))].sort();
    softwareOptions = [...new Set<string>(agg.map((r) => r.vending_software).filter(Boolean))].sort();
  } else {
    const [{ data: banks }, { data: sw }] = await Promise.all([
      supabase.from("bank_notifications").select("bank").limit(1000),
      supabase.from("vending_software").select("name").order("name"),
    ]);
    bankOptions = [...new Set<string>((banks ?? []).map((b: any) => b.bank).filter(Boolean))].sort();
    softwareOptions = (sw ?? []).map((x: any) => x.name as string);
  }
  return { rows: (rows ?? []).map(mapRow), total: count ?? 0, summary: summarize(agg), bankOptions, softwareOptions };
}

async function runExport(supabase: any, data: z.output<typeof schema>, meterIds: string[] | null) {
  const all: TxnRecord[] = [];
  for (let s = 0; s < 50000; s += 1000) {
    const { data: rows, error } = await build(supabase, COLS, data, undefined, meterIds)
      .order(data.sort, { ascending: data.dir === "asc", nullsFirst: false }).order("record_id").range(s, s + 999);
    if (error) throw new Error(error.message);
    all.push(...(rows ?? []).map(mapRow));
    if (!rows || rows.length < 1000) break;
  }
  // Tokens are not exported.
  return all.map((r) => ({ ...r, token: null }));
}

/** Meters registered to the signed-in vendor; the vendor comes from the session only. */
async function vendorMeterIds(context: any): Promise<string[]> {
  const { assertVendor } = await import("@/lib/vendor.server");
  const vendorId = await assertVendor(context as never);
  const { data, error } = await context.supabase.from("meters").select("id").eq("vendor_id", vendorId).limit(5000);
  if (error) throw new Error(error.message);
  return (data ?? []).map((m: any) => m.id as string);
}

export const listTransactionRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(listInput)
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    return runList((context as any).supabase, data, null);
  });

export const exportTransactionRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    return runExport((context as any).supabase, data, null);
  });

/** Vendor portal: same data, limited to the vendor's own meters. */
export const listVendorTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(listInput)
  .handler(async ({ data, context }) => runList((context as any).supabase, data, await vendorMeterIds(context)));

export const exportVendorTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => runExport((context as any).supabase, data, await vendorMeterIds(context)));
