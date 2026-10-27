import { darajaPost, darajaTimestamp, getDarajaToken, stkPassword } from "./mpesa.server";
import { matchingPaygCallback } from "./payg-payment";

export async function capabilityHash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

/** Provider lookup, not the public callback's asserted ResultCode, confirms payment. */
export async function verifyPaygPayment(db: any, attempt: any, callback?: any) {
  if (!attempt.checkout_request_id || attempt.status === "failed" || (attempt.status === "completed" && (!callback || attempt.receipt))) return;
  const { data: cfg } = await db.from("payment_method_configurations").select("*").eq("id", attempt.config_id).maybeSingle();
  if (!cfg?.consumer_key || !cfg.consumer_secret || !cfg.passkey) throw new Error("Payment verification is unavailable.");
  const token = await getDarajaToken(cfg.environment, cfg.consumer_key, cfg.consumer_secret);
  const timestamp = darajaTimestamp();
  const response = await darajaPost(cfg.environment, "/mpesa/stkpushquery/v1/query", token, {
    BusinessShortCode: cfg.business_short_code, Password: stkPassword(cfg.business_short_code, cfg.passkey, timestamp), Timestamp: timestamp, CheckoutRequestID: attempt.checkout_request_id,
  });
  const body = response.body;
  if (!response.ok || String(body?.ResponseCode) !== "0" || body?.ResultCode === undefined || body?.ResultCode === null) return;
  const success = String(body.ResultCode) === "0";
  if (success && callback && !matchingPaygCallback(attempt, callback)) throw new Error("Payment details require review.");
  const { data: confirmed, error } = await db.rpc("confirm_payg_payment", { p_attempt: attempt.id, p_success: success, p_receipt: success && callback ? callback.receipt : null, p_message: success ? null : "M-Pesa confirmed that this payment did not complete." });
  if (error) throw new Error("Could not record payment confirmation.");
  if (confirmed && success) {
    await db.from("notifications").insert({ user_id: attempt.resident_id, type: "payment", title: "Pay-as-you-go payment received", message: `Your KES ${Number(attempt.amount_cents) / 100} payment is confirmed.`, resource_type: "payg_plan", resource_id: attempt.plan_id });
  }
}

export async function handlePaygCallback(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("attempt");
  const capability = url.searchParams.get("key");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id) || !capability || !/^[0-9a-f-]{36}$/i.test(capability)) return new Response("Unauthorized", { status: 401 });
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data: attempt } = await db.from("payg_payment_attempts").select("*").eq("id", id).maybeSingle();
  if (!attempt || await capabilityHash(capability) !== attempt.callback_hash) return new Response("Unauthorized", { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > 16000) return new Response("Payload too large", { status: 413 });
  let payload: any;
  try { const raw = await request.text(); if (raw.length > 16000) return new Response("Payload too large", { status: 413 }); payload = JSON.parse(raw); }
  catch { return new Response("Invalid callback", { status: 400 }); }
  const cb = payload?.Body?.stkCallback;
  if (!cb || cb.CheckoutRequestID !== attempt.checkout_request_id || cb.MerchantRequestID !== attempt.merchant_request_id) return new Response("Invalid callback", { status: 400 });
  const items = Array.isArray(cb.CallbackMetadata?.Item) ? cb.CallbackMetadata.Item : [];
  const item = (name: string) => items.find((i: any) => i?.Name === name)?.Value;
  try {
    await verifyPaygPayment(db, attempt, String(cb.ResultCode) === "0" ? { checkout: cb.CheckoutRequestID, merchant: cb.MerchantRequestID, amount: item("Amount"), phone: item("PhoneNumber"), receipt: item("MpesaReceiptNumber") } : undefined);
  } catch { return new Response("Confirmation pending verification", { status: 503 }); }
  return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
}