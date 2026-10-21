import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canRetryVend, FEEDBACK_CATEGORIES, tokenVisible, validatePurchaseAmount } from "./resident-portal";
import { ownsResidentPhoto, residentPhotoPaths } from "./resident-photos";

const uuid = z.string().uuid();

export type PurchaseRow = {
  id: string; meter_id: string; status: string; created_at: string; amount: number;
  mpesa_receipt_number: string | null; error_message: string | null; meter_number: string; meter_type: string;
};

/**
 * Everything the signed-in resident may see, resolved server-side from their own
 * active unit assignments. All other queries are filtered to these ids.
 */
async function residentScope(ctx: { supabase: any; userId: string }) {
  const { data: isResident } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "resident" });
  if (!isResident) throw new Error("Resident access required");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const today = new Date().toISOString().slice(0, 10);
  const { data: asg } = await db.from("unit_assignments")
    .select("id, unit_id, start_date, end_date").eq("user_id", ctx.userId).eq("role", "resident");
  const active = (asg ?? []).filter((a: any) => !a.end_date || a.end_date >= today);
  const unitIds = [...new Set(active.map((a: any) => a.unit_id))] as string[];
  const { data: units } = unitIds.length
    ? await db.from("units").select("id, unit_number, building, unit_type, status, property_id").in("id", unitIds)
    : { data: [] };
  const propIds = [...new Set((units ?? []).map((u: any) => u.property_id))] as string[];
  const { data: props } = propIds.length
    ? await db.from("properties").select("id, name, address_line1, city, estate, landlord_id").in("id", propIds)
    : { data: [] };
  const { data: meters } = unitIds.length
    ? await db.from("meters").select("id, meter_number, type, status, unit_id, supplier_id, vending_software_id, landlord_id, agent_id, vendor_id, price_per_unit, commission_percentage, vat_on_commission_percentage").in("unit_id", unitIds)
    : { data: [] };
  return { db, assignments: active as any[], units: (units ?? []) as any[], properties: (props ?? []) as any[], meters: (meters ?? []) as any[] };
}

async function names(db: any, ids: string[]) {
  const clean = [...new Set(ids.filter((i) => i && /^[0-9a-f-]{36}$/i.test(i)))];
  if (!clean.length) return new Map<string, string>();
  const { data } = await db.from("users").select("id, name, email").in("id", clean);
  return new Map<string, string>((data ?? []).map((u: any) => [u.id, u.name ?? u.email ?? "—"]));
}

export const getResidentHome = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = await residentScope(context as any);
    const { db } = s;
    const meterIds = s.meters.map((m) => m.id);
    const [suppliers, software, lastTokens, purchases, jobs, notes, profile] = await Promise.all([
      s.meters.length ? db.from("meter_suppliers").select("id, name").in("id", s.meters.map((m) => m.supplier_id).filter(Boolean)) : { data: [] },
      s.meters.length ? db.from("vending_software").select("vending_software_id, name").in("vending_software_id", s.meters.map((m) => m.vending_software_id).filter(Boolean)) : { data: [] },
      meterIds.length ? db.from("meter_tokens").select("meter_id, created_at").in("meter_id", meterIds).eq("action", "credit").order("created_at", { ascending: false }).limit(200) : { data: [] },
      db.from("resident_token_purchases").select("id, meter_id, amount, status, created_at, mpesa_receipt_number").eq("resident_id", context.userId).order("created_at", { ascending: false }).limit(200),
      db.from("service_requests").select("id, request_number, issue_type, status, created_at").eq("resident_id", context.userId).order("created_at", { ascending: false }).limit(50),
      db.from("notifications").select("id, title, message, read_at, created_at").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(5),
      db.from("users").select("name, email, phone").eq("id", context.userId).maybeSingle(),
    ]);
    const owners = await names(db, s.meters.flatMap((m) => [m.landlord_id, m.agent_id, m.vendor_id]).concat(s.properties.map((p: any) => p.landlord_id)));
    const supMap = new Map((suppliers.data ?? []).map((r: any) => [r.id, r.name]));
    const swMap = new Map((software.data ?? []).map((r: any) => [r.vending_software_id, r.name]));
    const lastByMeter = new Map<string, string>();
    for (const t of lastTokens.data ?? []) if (!lastByMeter.has(t.meter_id)) lastByMeter.set(t.meter_id, t.created_at);
    const unitMap = new Map(s.units.map((u: any) => [u.id, u]));
    const propMap = new Map(s.properties.map((p: any) => [p.id, p]));
    const asgByUnit = new Map(s.assignments.map((a: any) => [a.unit_id, a]));

    const meters = s.meters.map((m) => {
      const u: any = unitMap.get(m.unit_id); const p: any = u ? propMap.get(u.property_id) : null;
      const ownerId = m.landlord_id ?? m.agent_id ?? m.vendor_id;
      return {
        id: m.id, meter_number: m.meter_number, type: m.type ?? "Electricity", status: m.status,
        supplier: String(supMap.get(m.supplier_id) ?? "—"), vending_software: String(swMap.get(m.vending_software_id) ?? "—"),
        unit_number: u?.unit_number ?? "—", property_name: p?.name ?? "—",
        owner: ownerId ? owners.get(ownerId) ?? "—" : "—",
        owner_type: m.landlord_id ? "Landlord" : m.agent_id ? "Agent" : m.vendor_id ? "Vendor" : null,
        last_purchase_at: lastByMeter.get(m.id) ?? null,
        price_per_unit: Number(m.price_per_unit ?? 0),
      };
    });
    const homes = s.units.map((u: any) => {
      const p: any = propMap.get(u.property_id); const a: any = asgByUnit.get(u.id);
      return {
        unit_id: u.id, unit_number: u.unit_number, building: u.building, unit_type: u.unit_type,
        property_name: p?.name ?? "—",
        address: [p?.address_line1, p?.estate, p?.city].filter(Boolean).join(", ") || "—",
        landlord: p?.landlord_id ? owners.get(p.landlord_id) ?? "—" : "—",
        lease_start: a?.start_date ?? null, lease_end: a?.end_date ?? null,
        meters: meters.filter((m) => s.meters.find((x) => x.id === m.id)?.unit_id === u.id).map((m) => `${m.type} · ${m.meter_number}`),
      };
    });
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const pRows = purchases.data ?? [];
    const meterNo = new Map(s.meters.map((m) => [m.id, m.meter_number]));
    return {
      name: profile.data?.name ?? profile.data?.email ?? "Resident",
      homes, meters,
      paidThisMonth: pRows.filter((p: any) => ["vended", "vend_failed", "paid", "vending"].includes(p.status) && p.created_at >= monthStart.toISOString())
        .reduce((a: number, p: any) => a + Number(p.amount), 0),
      activeJobs: (jobs.data ?? []).filter((j: any) => !["resolved", "closed", "cancelled"].includes(j.status)).length,
      recentJobs: (jobs.data ?? []).slice(0, 5),
      recentPurchases: (pRows as any[]).slice(0, 5).map((p: any) => ({ id: p.id as string, status: p.status as string, created_at: p.created_at as string, amount: Number(p.amount), meter_number: (meterNo.get(p.meter_id) ?? "—") as string })),
      notifications: notes.data ?? [],
    };
  });

/** Payment preview with the meter's commission + VAT (deducted from the payment). */
export const quoteTokenPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ meter_id: uuid, amount: z.coerce.number() }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await residentScope(context as any);
    const m = s.meters.find((x) => x.id === data.meter_id);
    if (!m) throw new Error("Meter not found");
    const err = validatePurchaseAmount(data.amount);
    if (err) throw new Error(err);
    const { data: d } = await s.db.from("pricing_settings").select("commission_percentage, vat_on_commission_percentage").maybeSingle();
    const { deductCommission } = await import("./commission");
    const b = deductCommission(data.amount, Number(m.commission_percentage ?? d?.commission_percentage ?? 0), Number(m.vat_on_commission_percentage ?? d?.vat_on_commission_percentage ?? 0));
    const price = Number(m.price_per_unit ?? 0);
    return { ...b, estimated_units: price > 0 ? Math.round((b.net_amount / price) * 100) / 100 : null, total_to_pay: data.amount };
  });

function baseUrl() {
  try {
    const o = getRequestHeader("origin"); if (o) return o.replace(/\/$/, "");
    const h = getRequestHeader("host"); if (h) return `https://${h}`;
  } catch { /* ignore */ }
  return "https://apps.smatrapay.com";
}

/** M-Pesa config for the meter's owner; otherwise the platform-wide one. Never another owner's. */
async function mpesaConfigFor(db: any, ownerId: string | null) {
  const pick = async (owner: string | null) => {
    let q = db.from("payment_method_configurations").select("*").eq("enabled", true).eq("stk_enabled", true);
    q = owner ? q.eq("owner_id", owner) : q.is("owner_id", null);
    const { data } = await q;
    const rows = (data ?? []).filter((r: any) => r.business_short_code && r.passkey && r.consumer_key && r.consumer_secret);
    return rows.find((r: any) => r.environment === "production") ?? rows[0] ?? null;
  };
  return (ownerId ? await pick(ownerId) : null) ?? (await pick(null));
}

export const startTokenPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    meter_id: uuid, amount: z.coerce.number(), phone: z.string().trim().min(9).max(15),
    request_id: z.string().trim().min(8).max(80),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await residentScope(context as any);
    const { db } = s;
    const m = s.meters.find((x) => x.id === data.meter_id);
    if (!m) throw new Error("Meter not found");
    if (m.status !== "active") throw new Error("This meter is not active. Contact your property manager.");
    if (!m.vending_software_id) throw new Error("This meter cannot sell tokens online yet. Contact your property manager.");
    const err = validatePurchaseAmount(data.amount);
    if (err) throw new Error(err);

    // Idempotent: repeated clicks with the same request id return the same purchase.
    const { data: existing } = await db.from("resident_token_purchases").select("id, status").eq("request_id", `${context.userId}:${data.request_id}`).maybeSingle();
    if (existing) return { id: existing.id as string, status: existing.status as string, message: "Purchase already started." };

    const ownerId = m.landlord_id ?? m.agent_id ?? (/^[0-9a-f-]{36}$/i.test(m.vendor_id ?? "") ? m.vendor_id : null);
    const cfg = await mpesaConfigFor(db, ownerId);
    if (!cfg) throw new Error("M-Pesa payments are not set up for this meter yet. Please contact your property manager.");

    const { normalizeMsisdn, getDarajaToken, darajaPost, darajaTimestamp, stkPassword } = await import("./mpesa.server");
    const msisdn = normalizeMsisdn(data.phone);
    const { data: purchase, error } = await db.from("resident_token_purchases").insert({
      resident_id: context.userId, meter_id: m.id, amount: data.amount, phone: msisdn,
      request_id: `${context.userId}:${data.request_id}`, status: "initiated",
    }).select("id").single();
    if (error) throw new Error("Could not start the purchase. Please try again.");

    const fail = async (msg: string) => {
      await db.from("resident_token_purchases").update({ status: "payment_failed", error_message: msg }).eq("id", purchase.id);
      return { id: purchase.id as string, status: "payment_failed", message: msg };
    };
    let token: string;
    try { token = await getDarajaToken(cfg.environment, cfg.consumer_key, cfg.consumer_secret); }
    catch { return fail("M-Pesa is unavailable right now. You have not been charged."); }
    const ts = darajaTimestamp();
    const res = await darajaPost(cfg.environment, "/mpesa/stkpush/v1/processrequest", token, {
      BusinessShortCode: cfg.business_short_code,
      Password: stkPassword(cfg.business_short_code, cfg.passkey, ts),
      Timestamp: ts,
      TransactionType: cfg.transaction_type || "CustomerPayBillOnline",
      Amount: Math.round(data.amount),
      PartyA: msisdn, PartyB: cfg.business_short_code, PhoneNumber: msisdn,
      CallBackURL: `${baseUrl()}/api/public/mpesa/stk-callback`,
      AccountReference: String(m.meter_number).slice(0, 12),
      TransactionDesc: "Prepaid token",
    });
    const body: any = res.body ?? {};
    if (!(res.ok && String(body.ResponseCode ?? "") === "0")) {
      return fail(body.errorMessage ?? body.ResponseDescription ?? "M-Pesa did not accept the request. You have not been charged.");
    }
    const { data: tx } = await db.from("mpesa_transactions").insert({
      payment_method_id: cfg.payment_method_id, user_id: context.userId, environment: cfg.environment, flow: "stk",
      merchant_request_id: body.MerchantRequestID ?? null, checkout_request_id: body.CheckoutRequestID,
      phone_number: msisdn, amount: data.amount, account_reference: m.meter_number, status: "pending",
      result_desc: body.CustomerMessage ?? "Request accepted",
    }).select("id").single();
    await db.from("resident_token_purchases").update({
      status: "pending_payment", checkout_request_id: body.CheckoutRequestID, mpesa_transaction_id: tx?.id ?? null,
    }).eq("id", purchase.id);
    return { id: purchase.id as string, status: "pending_payment", message: "Check your phone and enter your M-Pesa PIN." };
  });

export const getTokenPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await residentScope(context as any);
    const { data: p } = await s.db.from("resident_token_purchases").select("*").eq("id", data.id).eq("resident_id", context.userId).maybeSingle();
    if (!p) throw new Error("Purchase not found");
    let token: any = null;
    if (tokenVisible(p.status) && p.token_id) {
      const { data: t } = await s.db.from("meter_tokens").select("token, units, net_amount, commission_amount, vat_on_commission_amount, amount").eq("id", p.token_id).maybeSingle();
      token = t;
    }
    const meter = s.meters.find((m) => m.id === p.meter_id);
    return {
      id: p.id, status: p.status as string, amount: Number(p.amount), phone: p.phone, created_at: p.created_at,
      receipt: p.mpesa_receipt_number, error: p.error_message, meter_number: meter?.meter_number ?? "—",
      meter_type: meter?.type ?? "—", token,
    };
  });

export const retryTokenPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await residentScope(context as any);
    const { data: p } = await s.db.from("resident_token_purchases").select("status").eq("id", data.id).eq("resident_id", context.userId).maybeSingle();
    if (!p) throw new Error("Purchase not found");
    if (!canRetryVend(p.status)) throw new Error("This purchase cannot be retried.");
    const { vendResidentPurchase } = await import("./resident-purchase.server");
    return vendResidentPurchase(data.id);
  });

export const listMyPurchases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    status: z.string().optional(), meter_id: uuid.optional(),
    from: z.string().optional(), to: z.string().optional(), q: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await residentScope(context as any);
    let q = s.db.from("resident_token_purchases").select("id, meter_id, amount, status, created_at, mpesa_receipt_number, error_message")
      .eq("resident_id", context.userId).order("created_at", { ascending: false }).limit(500);
    if (data.status) q = q.eq("status", data.status);
    if (data.meter_id) q = q.eq("meter_id", data.meter_id);
    if (data.from) q = q.gte("created_at", `${data.from}T00:00:00+03:00`);
    if (data.to) q = q.lte("created_at", `${data.to}T23:59:59.999+03:00`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    // Meters the resident no longer holds still show their own past purchases.
    const ids = [...new Set((rows ?? []).map((r: any) => r.meter_id))];
    const { data: ms } = ids.length ? await s.db.from("meters").select("id, meter_number, type").in("id", ids) : { data: [] };
    const M = new Map((ms ?? []).map((m: any) => [m.id, m]));
    let out: PurchaseRow[] = ((rows ?? []) as any[]).map((r: any) => ({
      id: r.id, meter_id: r.meter_id, status: r.status, created_at: r.created_at,
      mpesa_receipt_number: r.mpesa_receipt_number ?? null, error_message: r.error_message ?? null, amount: Number(r.amount),
      meter_number: (M.get(r.meter_id) as any)?.meter_number ?? "—", meter_type: (M.get(r.meter_id) as any)?.type ?? "—",
    }));
    const term = data.q?.trim().toLowerCase();
    if (term) out = out.filter((r) => [r.meter_number, r.mpesa_receipt_number].some((v) => String(v ?? "").toLowerCase().includes(term)));
    return out;
  });

export const createMyServiceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    meter_id: uuid, issue_type: z.string().min(2).max(60),
    priority: z.enum(["low", "medium", "high"]), description: z.string().trim().min(5).max(2000),
    preferred_date: z.string().optional(),
    photo_paths: residentPhotoPaths,
  }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await residentScope(context as any);
    const m = s.meters.find((x) => x.id === data.meter_id);
    if (!m) throw new Error("Meter not found");
    const vendorId = /^[0-9a-f-]{36}$/i.test(m.vendor_id ?? "") ? m.vendor_id : null;
    if (!vendorId) throw new Error("This meter has no managing vendor yet. Please contact your property manager.");
    if (data.photo_paths.some((path) => !ownsResidentPhoto(path, context.userId))) throw new Error("Invalid photo attachment");
    const { data: created, error } = await s.db.rpc("create_resident_service_request", {
      p_resident: context.userId, p_meter: m.id, p_vendor: vendorId, p_issue: data.issue_type,
      p_priority: data.priority, p_description: data.description, p_preferred: data.preferred_date || null,
      p_photos: [...new Set(data.photo_paths)],
    });
    if (error) throw new Error("Could not submit the request. Please try again.");
    return { request_number: created.request_number as string };
  });

export const listMyMetersForForms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = await residentScope(context as any);
    return s.meters.map((m) => ({ id: m.id, meter_number: m.meter_number, type: m.type ?? "Electricity", status: m.status }));
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("users").select("name, email, phone, address, username, created_at").eq("id", context.userId).maybeSingle();
    return data;
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    name: z.string().trim().min(2).max(120), phone: z.string().trim().max(20).optional(), address: z.string().trim().max(250).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await residentScope(context as any);
    // Only contact fields; status, roles and email stay with the existing account workflow.
    const { error } = await context.supabase.from("users")
      .update({ name: data.name, phone: data.phone || null, address: data.address || null, updated_by: context.userId })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const submitFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    category: z.enum(FEEDBACK_CATEGORIES), rating: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await residentScope(context as any);
    const { error } = await context.supabase.from("resident_feedback").insert({ resident_id: context.userId, ...data, comment: data.comment || null });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMyEnquiries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("resident_enquiries").select("id, reference, kind, subject, status, staff_response, created_at")
      .eq("resident_id", context.userId).order("created_at", { ascending: false });
    return data ?? [];
  });

export const submitEnquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    kind: z.enum(["insurance", "loan", "support"]), subject: z.string().trim().min(3).max(150), message: z.string().trim().min(5).max(2000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await residentScope(context as any);
    const { data: row, error } = await context.supabase.from("resident_enquiries")
      .insert({ resident_id: context.userId, ...data }).select("reference").single();
    if (error) throw new Error(error.message);
    return { reference: row.reference as string };
  });

const SUPPORT_PROMPT = `You are SmatraPay Resident Support, a helpful assistant for residents using prepaid meters.
Rules:
- Use ONLY the "Verified account data" block for anything about this resident; say "according to your account" when you do. Never invent balances, tokens, invoices or approvals.
- Rent invoices, rent statements, insurance and loan products are not available online yet; say so honestly and offer an enquiry.
- You cannot buy tokens, issue tokens, change balances or submit requests yourself. Point to the right page instead:
  Buy Tokens (/resident/buy-tokens), My Token Purchases (/resident/transactions), Statements (/resident/statements),
  Maintenance requests (/resident/jobs), Insurance & Loans (/resident/financial-services), Feedback (/resident/feedback),
  Escalate to a person (Support page, "Contact support" form), Profile (/resident/profile).
- How tokens work: pay with M-Pesa on Buy Tokens; the token appears once payment is confirmed; enter the 20 digits on the meter keypad. If a payment went through but no token appeared, use Retry in My Token Purchases — you won't be charged again.
- Keep answers short and in plain language. Use markdown lists where helpful.`;

export const askResidentSupport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).min(1).max(40),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await residentScope(context as any);
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("Support assistant is not configured.");
    const [{ data: purchases }, { data: jobs }] = await Promise.all([
      s.db.from("resident_token_purchases").select("amount, status, created_at, meter_id, mpesa_receipt_number").eq("resident_id", context.userId).order("created_at", { ascending: false }).limit(10),
      s.db.from("service_requests").select("request_number, issue_type, status, created_at").eq("resident_id", context.userId).order("created_at", { ascending: false }).limit(10),
    ]);
    const meterNo = new Map(s.meters.map((m) => [m.id, m.meter_number]));
    const facts = {
      homes: s.units.map((u: any) => ({ unit: u.unit_number, property: (s.properties.find((p: any) => p.id === u.property_id) as any)?.name })),
      meters: s.meters.map((m) => ({ number: m.meter_number, type: m.type, status: m.status })),
      recent_token_purchases: (purchases ?? []).map((p: any) => ({ ...p, meter: meterNo.get(p.meter_id), meter_id: undefined })),
      service_requests: jobs ?? [],
    };
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        reasoning_effort: "low",
        stream: true,
        messages: [
          { role: "system", content: `${SUPPORT_PROMPT}\n\nVerified account data (JSON):\n${JSON.stringify(facts)}` },
          ...data.messages,
        ],
      }),
    });
    if (res.status === 429) throw new Error("The assistant is busy right now. Try again shortly.");
    if (res.status === 402) throw new Error("The assistant is temporarily unavailable. Please contact support.");
    if (!res.ok || !res.body) throw new Error("The assistant is unavailable right now.");
    const reader = res.body.getReader(); const dec = new TextDecoder();
    let buf = ""; let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (payload === "[DONE]") continue;
        try { text += JSON.parse(payload)?.choices?.[0]?.delta?.content ?? ""; } catch { /* partial */ }
      }
    }
    if (!text.trim()) throw new Error("The assistant could not answer that. Try rephrasing, or contact support.");
    return { reply: text };
  });
