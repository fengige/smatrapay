import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { residentScope } from "./resident-portal.functions";
import { paygProgress, paygStartSchema, paygTerms, type PaygPlanView } from "./payg-payment";
import { capabilityHash, verifyPaygPayment } from "./payg-payment.server";
import { mpesaConfigFor, normalizeMsisdn, darajaTimestamp, darajaPost, getDarajaToken, stkPassword } from "./mpesa.server";

export const getResidentPaygPlans = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }): Promise<PaygPlanView[]> => {
  const { db } = await residentScope(context as any);
  const { data: plans, error } = await db.from("payg_plans").select("*").eq("resident_id", context.userId).order("created_at", { ascending: false });
  if (error) throw new Error("Could not load your plans.");
  const ids = (plans ?? []).map((p: any) => p.id);
  const { data: attempts, error: paymentError } = ids.length ? await db.from("payg_payment_attempts").select("id,plan_id,amount_cents,status,receipt,error_message,created_at").eq("resident_id", context.userId).in("plan_id", ids).order("created_at", { ascending: false }) : { data: [], error: null };
  if (paymentError) throw new Error("Could not load payment progress.");
  return (plans ?? []).map((p: any) => {
    const payments = (attempts ?? []).filter((a: any) => a.plan_id === p.id).map(({ plan_id, ...a }: any) => ({ ...a, amount_cents: Number(a.amount_cents) }));
    return { id: p.id, product_id: p.product_id, product_name: p.product_name, down_payment_cents: Number(p.down_payment_cents), instalment_cents: Number(p.instalment_cents), instalment_count: p.instalment_count, frequency: p.frequency, total_cents: Number(p.total_cents), ...paygProgress(p, payments), payments } as PaygPlanView;
  });
});

export const getPaygPaymentAvailability = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const s = await residentScope(context as any);
  const ids = [...new Set(s.meters.map(m => m.vendor_id).filter(Boolean))] as string[];
  const results = await Promise.all(ids.map(async id => { const cfg = await mpesaConfigFor(s.db, id); return { vendor_id: id, available: Boolean(cfg && cfg.currency === "KES" && cfg.country === "KE") }; }));
  return results;
});

export const startPaygPayment = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => paygStartSchema.parse(d)).handler(async ({ context, data }) => {
  const s = await residentScope(context as any);
  const { db } = s;
  const { data: product } = await db.from("payg_products").select("*").eq("id", data.product_id).maybeSingle();
  if (!product || !s.meters.some(m => m.vendor_id === product.vendor_id)) throw new Error("Product is not available to your account.");
  let { data: plan } = await db.from("payg_plans").select("*").eq("resident_id", context.userId).eq("product_id", product.id).maybeSingle();
  if (!plan && !product.is_active) throw new Error("This product is no longer offered.");
  const cfg = await mpesaConfigFor(db, product.vendor_id);
  if (!cfg) throw new Error("M-Pesa payments are not configured for this vendor yet.");
  if (cfg.currency !== "KES" || cfg.country !== "KE") throw new Error("This plan requires Kenyan M-Pesa payments.");
  if (!plan) {
    const terms = paygTerms(product);
    const { data: created, error } = await db.from("payg_plans").insert({ resident_id: context.userId, vendor_id: product.vendor_id, product_id: product.id, product_name: product.name, ...terms }).select("*").single();
    if (error) {
      const { data: existing } = await db.from("payg_plans").select("*").eq("resident_id", context.userId).eq("product_id", product.id).maybeSingle();
      if (!existing) throw new Error("Could not create your plan.");
      plan = existing;
    } else plan = created;
  }
  if (!plan) throw new Error("Could not create your plan.");
  const capability = crypto.randomUUID();
  const phone = normalizeMsisdn(data.phone);
  const { data: attempt, error } = await db.rpc("begin_payg_payment", { p_plan: plan.id, p_resident: context.userId, p_request: data.request_id, p_phone: phone, p_config: cfg.id, p_hash: await capabilityHash(capability) });
  if (error || !attempt) throw new Error("Could not start the payment. Check your plan before trying again.");
  if (!attempt.created) return { id: attempt.id as string, status: attempt.status as string, message: "This payment has already been started. Check its status before paying again." };
  const fail = async (status: string, message: string) => {
    const { error: writeError } = await db.from("payg_payment_attempts").update({ status, error_message: message }).eq("id", attempt.id).eq("status", "initiated");
    if (writeError) throw new Error("Payment status could not be saved. Do not pay again; contact support.");
    return { id: attempt.id as string, status, message };
  };
  let token: string;
  try { token = await getDarajaToken(cfg.environment, cfg.consumer_key, cfg.consumer_secret); }
  catch { return fail("failed", "M-Pesa is unavailable; no payment prompt was sent."); }
  const timestamp = darajaTimestamp();
  let result;
  try {
    result = await darajaPost(cfg.environment, "/mpesa/stkpush/v1/processrequest", token, {
      BusinessShortCode: cfg.business_short_code, Password: stkPassword(cfg.business_short_code, cfg.passkey, timestamp), Timestamp: timestamp, TransactionType: cfg.transaction_type || "CustomerPayBillOnline", Amount: Number(attempt.amount_cents) / 100, PartyA: phone, PartyB: cfg.business_short_code, PhoneNumber: phone,
      CallBackURL: `https://apps.smatrapay.com/api/public/mpesa/payg-callback?attempt=${attempt.id}&key=${capability}`, AccountReference: `PAYG${String(plan.id).replace(/-/g, "").slice(0, 8)}`, TransactionDesc: "PAYG instalment",
    });
  } catch { return fail("uncertain", "Payment request outcome is unknown. Do not pay again; contact support."); }
  const body: any = result.body;
  if (!result.ok || String(body?.ResponseCode) !== "0") return fail(body?.errorCode || body?.ResponseCode ? "failed" : "uncertain", "M-Pesa could not accept or confirm the request. Check payment status before trying again.");
  if (!body.CheckoutRequestID || !body.MerchantRequestID) return fail("uncertain", "Payment identifiers are missing. Contact support before paying again.");
  const { error: saveError } = await db.from("payg_payment_attempts").update({ status: "pending", checkout_request_id: body.CheckoutRequestID, merchant_request_id: body.MerchantRequestID }).eq("id", attempt.id).eq("status", "initiated");
  if (saveError) return fail("uncertain", "The payment requires review. Do not pay again.");
  const { data: tx } = await db.from("mpesa_transactions").insert({ payment_method_id: cfg.payment_method_id, user_id: context.userId, environment: cfg.environment, flow: "stk", merchant_request_id: body.MerchantRequestID, checkout_request_id: body.CheckoutRequestID, phone_number: phone, amount: Number(attempt.amount_cents) / 100, account_reference: `PAYG:${plan.id}`, status: "pending", result_desc: "Pay-as-you-go payment pending" }).select("id").single();
  if (tx) {
    await db.from("payg_payment_attempts").update({ mpesa_transaction_id: tx.id }).eq("id", attempt.id);
    // A callback can beat the transaction-link write; preserve the already confirmed result.
    const { data: state } = await db.from("payg_payment_attempts").select("status,receipt").eq("id", attempt.id).maybeSingle();
    if (state && ["completed", "failed"].includes(state.status)) await db.from("mpesa_transactions").update({ status: state.status, mpesa_receipt_number: state.receipt }).eq("id", tx.id);
  }
  return { id: attempt.id as string, status: "pending", message: "Check your phone and enter your M-Pesa PIN. Progress updates only after confirmation." };
});

export const checkPaygPayment = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d)).handler(async ({ context, data }) => {
  const { db } = await residentScope(context as any);
  const { data: attempt } = await db.from("payg_payment_attempts").select("*").eq("id", data.id).eq("resident_id", context.userId).maybeSingle();
  if (!attempt) throw new Error("Payment not found.");
  try { await verifyPaygPayment(db, attempt); } catch { throw new Error("M-Pesa verification is unavailable. Your payment remains pending; do not pay again."); }
  return { ok: true };
});