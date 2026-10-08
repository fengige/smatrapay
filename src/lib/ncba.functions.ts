import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Admin access required");
}

export type NcbaPaymentRow = {
  id: string;
  trans_id: string;
  bank: string | null;
  meter_number: string | null;
  trans_time: string | null;
  trans_amount: number;
  narrative: string | null;
  bill_ref_number: string | null;
  mobile: string | null;
  status: string;
  error_code: string | null;
  error_message: string | null;
  sms_status: string | null;
  attempts: number;
  auto_retry_count: number;
  next_retry_at: string | null;
  token: string | null;
  created_at: string;
  updated_at: string;
};

export const listNcbaPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ status: z.enum(["problems", "all", "completed"]).default("problems") }).parse(d ?? {}))
  .handler(async ({ data, context }): Promise<NcbaPaymentRow[]> => {
    await assertAdmin(context as never);
    const supabase = context.supabase as any;
    let q = supabase.from("bank_notifications").select("*").order("created_at", { ascending: false }).limit(200);
    if (data.status === "problems") q = q.in("status", ["failed", "retry_pending", "needs_review", "processing"]);
    if (data.status === "completed") q = q.eq("status", "completed");
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const tokenIds = (rows ?? []).map((r: any) => r.token_id).filter(Boolean);
    const tokens = new Map<string, string>();
    if (tokenIds.length) {
      const { data: t } = await supabase.from("meter_tokens").select("id, token").in("id", tokenIds);
      for (const x of t ?? []) tokens.set(x.id, x.token);
    }
    return (rows ?? []).map((r: any) => ({
      id: r.id, bank: r.bank ?? null, trans_id: r.trans_id, meter_number: r.meter_number ?? null,
      trans_time: r.trans_time, trans_amount: Number(r.trans_amount ?? 0),
      narrative: r.narrative, bill_ref_number: r.bill_ref_number, mobile: r.mobile, status: r.status,
      error_code: r.error_code, error_message: r.error_message, sms_status: r.sms_status,
      attempts: r.attempts ?? 0, auto_retry_count: r.auto_retry_count ?? 0, next_retry_at: r.next_retry_at,
      token: r.token_id ? (tokens.get(r.token_id) ?? null) : null, created_at: r.created_at, updated_at: r.updated_at,
    }));
  });

const bankSearchSchema = z.object({
  status: z.enum(["problems", "all", "completed"]).default("problems"),
  q: z.string().max(100).default(""),
  bank: z.string().max(50).default(""),
  transId: z.string().max(100).default(""),
  meter: z.string().max(100).default(""),
  mobile: z.string().max(50).default(""),
  name: z.string().max(100).default(""),
  rowStatus: z.string().max(50).default(""),
  minAmount: z.number().nullable().default(null),
  maxAmount: z.number().nullable().default(null),
  from: z.string().max(10).default(""), // YYYY-MM-DD, inclusive
  to: z.string().max(10).default(""),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  ownerName: z.string().max(100).default(""),
  ownerType: z.enum(["all", "vendor", "landlord", "agent"]).default("all"),
});
export type BankSearch = z.input<typeof bankSearchSchema>;

/** Strip PostgREST filter syntax characters from free text before using it in ilike/or(). */
const clean = (s: string) => s.replace(/[%,()*\\]/g, " ").trim();

function applyBankFilters(q: any, f: z.output<typeof bankSearchSchema>) {
  if (f.status === "problems") q = q.in("status", ["failed", "retry_pending", "needs_review", "processing"]);
  if (f.status === "completed") q = q.eq("status", "completed");
  if (f.rowStatus) q = q.eq("status", f.rowStatus);
  if (f.bank) q = q.eq("bank", f.bank);
  if (clean(f.transId)) q = q.ilike("trans_id", `%${clean(f.transId)}%`);
  if (clean(f.meter)) q = q.ilike("meter_number", `%${clean(f.meter)}%`);
  if (clean(f.mobile)) q = q.ilike("mobile", `%${clean(f.mobile)}%`);
  if (clean(f.name)) q = q.ilike("payer_name", `%${clean(f.name)}%`);
  if (f.minAmount != null) q = q.gte("trans_amount", f.minAmount);
  if (f.maxAmount != null) q = q.lte("trans_amount", f.maxAmount);
  // Date range on the received time shown on the page (Nairobi, UTC+3), inclusive of both days.
  if (/^\d{4}-\d{2}-\d{2}$/.test(f.from)) q = q.gte("created_at", `${f.from}T00:00:00+03:00`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(f.to)) q = q.lte("created_at", `${f.to}T23:59:59.999+03:00`);
  const g = clean(f.q);
  if (g) {
    const p = `%${g}%`;
    q = q.or(`trans_id.ilike.${p},meter_number.ilike.${p},mobile.ilike.${p},payer_name.ilike.${p},bank.ilike.${p},narrative.ilike.${p},business_short_code.ilike.${p}`);
  }
  return q;
}

type OwnerType = "vendor" | "landlord" | "agent";
/** Same precedence as resolveMeterOwner: landlord → agent → vendor. */
function ownerOfMeter(m: any): { id: string; type: OwnerType } | null {
  if (m.landlord_id) return { id: m.landlord_id, type: "landlord" };
  if (m.agent_id) return { id: m.agent_id, type: "agent" };
  if (m.vendor_id && /^[0-9a-f-]{36}$/i.test(m.vendor_id)) return { id: m.vendor_id, type: "vendor" };
  return null;
}

/** Meter numbers whose owner matches the owner filters, or null when no owner filter is set. */
async function ownerMeterNumbers(supabase: any, f: z.output<typeof bankSearchSchema>): Promise<string[] | null> {
  const name = clean(f.ownerName);
  if (!name && f.ownerType === "all") return null;
  let ids: string[] | null = null;
  if (name) {
    const { data: us } = await supabase.from("users").select("id").ilike("name", `%${name}%`).limit(1000);
    ids = (us ?? []).map((u: any) => u.id);
    if (!ids!.length) return [];
  }
  let mq = supabase.from("meters").select("meter_number, landlord_id, agent_id, vendor_id");
  if (f.ownerType === "landlord") mq = mq.not("landlord_id", "is", null);
  else if (f.ownerType === "agent") mq = mq.is("landlord_id", null).not("agent_id", "is", null);
  else if (f.ownerType === "vendor") mq = mq.is("landlord_id", null).is("agent_id", null).not("vendor_id", "is", null);
  if (ids) mq = mq.or(`landlord_id.in.(${ids.join(",")}),agent_id.in.(${ids.join(",")}),vendor_id.in.(${ids.join(",")})`);
  const out: string[] = [];
  for (let start = 0; start < 20000; start += 1000) {
    const { data: ms, error } = await mq.range(start, start + 999);
    if (error) throw new Error(error.message);
    for (const m of ms ?? []) {
      const o = ownerOfMeter(m);
      if (!o || (f.ownerType !== "all" && o.type !== f.ownerType) || (ids && !ids.includes(o.id))) continue;
      if (m.meter_number) out.push(m.meter_number);
    }
    if (!ms || ms.length < 1000) break;
  }
  return out;
}

async function filtered(supabase: any, select: string, f: z.output<typeof bankSearchSchema>, opts?: any) {
  const nums = await ownerMeterNumbers(supabase, f);
  let q = supabase.from("bank_notifications").select(select, opts);
  q = applyBankFilters(q, f);
  if (nums) q = q.in("meter_number", nums.length ? nums : ["__none__"]);
  return q;
}

export type BankPaymentExportRow = NcbaPaymentRow & {
  payer_name: string | null;
  business_short_code: string | null;
  trans_type: string | null;
  bank_reference: string | null;
  payment_status: string | null;
  processed_at: string | null;
  commission_percentage: number | null;
  commission_amount: number | null;
  vat_on_commission_percentage: number | null;
  vat_on_commission_amount: number | null;
  net_amount: number | null;
  owner_name: string | null;
  owner_type: "Vendor" | "Landlord" | "Agent" | null;
};

async function mapRows(supabase: any, rows: any[]): Promise<BankPaymentExportRow[]> {
  const tokenIds = rows.map((r) => r.token_id).filter(Boolean);
  const tokens = new Map<string, any>();
  for (let i = 0; i < tokenIds.length; i += 200) {
    const { data: t } = await supabase.from("meter_tokens")
      .select("id, token, commission_percentage, commission_amount, vat_on_commission_percentage, vat_on_commission_amount, net_amount")
      .in("id", tokenIds.slice(i, i + 200));
    for (const x of t ?? []) tokens.set(x.id, x);
  }
  // Batched owner lookup: meter_number → meter → owner (landlord → agent → vendor) → user name.
  const nums = [...new Set(rows.map((r) => r.meter_number).filter(Boolean))] as string[];
  const ownerByNum = new Map<string, { id: string; type: OwnerType }>();
  for (let i = 0; i < nums.length; i += 200) {
    const { data: ms } = await supabase.from("meters").select("meter_number, landlord_id, agent_id, vendor_id").in("meter_number", nums.slice(i, i + 200));
    for (const m of ms ?? []) { const o = ownerOfMeter(m); if (o) ownerByNum.set(m.meter_number, o); }
  }
  const uids = [...new Set([...ownerByNum.values()].map((o) => o.id))];
  const nameById = new Map<string, string>();
  for (let i = 0; i < uids.length; i += 200) {
    const { data: us } = await supabase.from("users").select("id, name").in("id", uids.slice(i, i + 200));
    for (const u of us ?? []) nameById.set(u.id, u.name);
  }
  const typeLabel = { vendor: "Vendor", landlord: "Landlord", agent: "Agent" } as const;
  const n = (v: any) => (v == null ? null : Number(v));
  return rows.map((r) => {
    const t = r.token_id ? tokens.get(r.token_id) : null;
    return {
      id: r.id, bank: r.bank ?? null, trans_id: r.trans_id, meter_number: r.meter_number ?? null,
      trans_time: r.trans_time, trans_amount: Number(r.trans_amount ?? 0),
      narrative: r.narrative, bill_ref_number: r.bill_ref_number, mobile: r.mobile, status: r.status,
      error_code: r.error_code, error_message: r.error_message, sms_status: r.sms_status,
      attempts: r.attempts ?? 0, auto_retry_count: r.auto_retry_count ?? 0, next_retry_at: r.next_retry_at,
      token: t?.token ?? null, created_at: r.created_at, updated_at: r.updated_at,
      payer_name: r.payer_name ?? null, business_short_code: r.business_short_code ?? null,
      trans_type: r.trans_type ?? null, bank_reference: r.bank_reference ?? null,
      payment_status: r.payment_status ?? null, processed_at: r.processed_at ?? null,
      commission_percentage: n(t?.commission_percentage), commission_amount: n(t?.commission_amount),
      vat_on_commission_percentage: n(t?.vat_on_commission_percentage), vat_on_commission_amount: n(t?.vat_on_commission_amount),
      net_amount: n(t?.net_amount),
      owner_name: (() => { const o = r.meter_number ? ownerByNum.get(r.meter_number) : null; return o ? (nameById.get(o.id) ?? null) : null; })(),
      owner_type: (() => { const o = r.meter_number ? ownerByNum.get(r.meter_number) : null; return o ? typeLabel[o.type] : null; })(),
    };
  });
}

const COLS = "id, bank, trans_id, meter_number, trans_time, trans_amount, narrative, bill_ref_number, mobile, status, error_code, error_message, sms_status, attempts, auto_retry_count, next_retry_at, token_id, created_at, updated_at, payer_name, business_short_code, trans_type, bank_reference, payment_status, processed_at";

/** One page of bank payments with all filters applied in the database. Admin only. */
export const searchBankPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    bankSearchSchema.extend({ page: z.number().int().min(1).max(100000).default(1), pageSize: z.number().int().min(10).max(200).default(50) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const supabase = context.supabase as any;
    const start = (data.page - 1) * data.pageSize;
    let q = await filtered(supabase, COLS, data, { count: "exact" });
    q = q.order("created_at", { ascending: data.sortDir === "asc" }).range(start, start + data.pageSize - 1);
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    const { data: banks } = await supabase.from("bank_notifications").select("bank").limit(1000);
    const bankOptions = [...new Set<string>((banks ?? []).map((b: any) => b.bank).filter(Boolean))].sort();
    return { rows: await mapRows(supabase, rows ?? []), total: count ?? 0, bankOptions };
  });

/** Every row matching the filters (paged through in the database) for export. Admin only. */
export const exportBankPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bankSearchSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const supabase = context.supabase as any;
    const all: any[] = [];
    for (let start = 0; start < 50000; start += 1000) {
      let q = await filtered(supabase, COLS, data);
      q = q.order("created_at", { ascending: data.sortDir === "asc" }).order("id").range(start, start + 999);
      const { data: rows, error } = await q;
      if (error) throw new Error(error.message);
      all.push(...(rows ?? []));
      if (!rows || rows.length < 1000) break;
    }
    return mapRows(supabase, all);
  });


/** Admin retry of one payment. Never re-vends a completed payment (TransID idempotency). */
export const retryNcbaPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { data: row } = await (context.supabase as any).from("bank_notifications").select("status").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Payment not found");
    if (row.status === "completed") return { status: "completed", message: "Already completed — no new token generated." };
    if (row.status === "processing") throw new Error("This payment is being processed right now. Try again in a minute.");
    const { vendNcbaNotification } = await import("@/lib/ncba.server");
    return vendNcbaNotification(data.id, { manual: true, actorId: context.userId });
  });

/** Run queued automatic retries that are due now. */
export const runDueNcbaRetries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { processDueNcbaRetries } = await import("@/lib/ncba.server");
    const r = await processDueNcbaRetries(10);
    return { processed: r.length, completed: r.filter((x) => x.status === "completed").length };
  });
