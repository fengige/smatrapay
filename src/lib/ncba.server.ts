import { z } from "zod";

/**
 * NCBA Pay Bill notification processing.
 *
 * validate -> idempotency (TransID) -> meter from Narrative -> shared
 * vendMeterToken (commission/VAT deduction, units, vending software) ->
 * owner SMS receipt -> acknowledge.
 */

export const SUPPORTED_TRANS_TYPES = ["Pay Bill", "PayBill", "Paybill"];

export const ncbaPayload = z.object({
  TransType: z.string().trim().min(1),
  TransID: z.string().trim().min(1).max(64),
  FTRef: z.string().trim().max(64).optional().nullable(),
  TransTime: z.string().trim().min(1).max(40),
  TransAmount: z.union([z.string(), z.number()]).transform((v) => String(v).trim()),
  BusinessShortCode: z.union([z.string(), z.number()]).transform((v) => String(v).trim()),
  BillRefNumber: z.string().trim().max(120).optional().nullable(),
  Narrative: z.string().trim().min(1, "Narrative (meter number) is required").max(64),
  Mobile: z.string().trim().max(20).optional().nullable(),
  name: z.string().max(120).optional().nullable(),
  Username: z.string().max(200).optional().nullable(),
  Password: z.string().max(200).optional().nullable(),
  Hash: z.string().max(500).optional().nullable(),
});
export type NcbaPayload = z.infer<typeof ncbaPayload>;

/** Decimal-safe money parse: "5000.00" -> 5000 (max 2 dp), or null if invalid. */
export function parseNcbaAmount(raw: string): number | null {
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(raw)) return null;
  const [whole, frac = ""] = raw.split(".");
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return cents > 0 ? cents / 100 : null;
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i += 1) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

export type NcbaAuthConfig = { username: string; password: string; hash: string; shortcode: string };

export function checkNcbaAuth(p: NcbaPayload, cfg: NcbaAuthConfig): string | null {
  if (!safeEqual(p.Username ?? "", cfg.username) || !safeEqual(p.Password ?? "", cfg.password))
    return "AUTH_FAILED";
  if (!safeEqual(p.Hash ?? "", cfg.hash)) return "HASH_INVALID";
  if (p.BusinessShortCode !== cfg.shortcode) return "SHORTCODE_INVALID";
  if (!SUPPORTED_TRANS_TYPES.includes(p.TransType)) return "TRANS_TYPE_UNSUPPORTED";
  return null;
}

export const ack = (code: string, desc: string, status = 200) =>
  Response.json({ ResultCode: code, ResultDesc: desc }, { status });

export async function processNcbaNotification(p: NcbaPayload, amount: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  // 1. Idempotency on TransID (unique column).
  const { data: existing } = await db.from("ncba_notifications").select("*").eq("trans_id", p.TransID).maybeSingle();
  if (existing?.status === "completed") return ack("0", "Duplicate notification — already processed");
  if (existing?.status === "processing" && Date.now() - new Date(existing.updated_at).getTime() < 120_000)
    return ack("1", "Notification is being processed — retry later", 409);

  const record = {
    trans_id: p.TransID,
    trans_type: p.TransType,
    ft_ref: p.FTRef || null,
    trans_time: p.TransTime,
    trans_amount: amount,
    business_short_code: p.BusinessShortCode,
    bill_ref_number: p.BillRefNumber || null,
    narrative: p.Narrative,
    mobile: p.Mobile || null,
    payer_name: p.name?.trim() || null,
    meter_number: p.Narrative,
    status: "processing",
    attempts: (existing?.attempts ?? 0) + 1,
    error_code: null,
    error_message: null,
  };
  const saved = existing
    ? await db.from("ncba_notifications").update(record).eq("id", existing.id).select("id").single()
    : await db.from("ncba_notifications").insert(record).select("id").single();
  if (saved.error) {
    if (/duplicate|unique/i.test(saved.error.message)) return ack("1", "Notification is being processed — retry later", 409);
    return ack("1", "Could not record the notification — retry later", 500);
  }
  const rowId = saved.data.id as string;
  const fail = async (code: string, message: string, extra: Record<string, unknown> = {}) => {
    await db.from("ncba_notifications").update({ status: "failed", error_code: code, error_message: message, ...extra }).eq("id", rowId);
  };

  // 2. Meter = Narrative.
  const { data: meter } = await db
    .from("meters")
    .select("id, meter_number, status")
    .eq("meter_number", p.Narrative)
    .maybeSingle();
  if (!meter) {
    await fail("METER_NOT_FOUND", `Meter ${p.Narrative} was not found.`);
    // Payment is recorded; acknowledge so NCBA doesn't retry an unfixable request.
    return ack("0", "Payment recorded — meter not found");
  }

  // 3. Shared token flow: commission + VAT deduction, units, vending software, persistence.
  const { vendMeterToken } = await import("@/lib/vending/vend.server");
  let tokenRow: any;
  try {
    const { row } = await vendMeterToken(db, {
      meterId: meter.id,
      action: "credit",
      units: 0,
      amount,
      vendByUnit: false,
      reference: p.TransID,
      customerPhone: p.Mobile || null,
      smsRequested: !!p.Mobile,
      expiresInDays: 30,
      actorId: null,
      requestId: `ncba:${p.TransID}`,
    });
    tokenRow = row;
  } catch (e) {
    const message = (e as Error).message || "Token generation failed";
    await fail("TOKEN_GENERATION_FAILED", message, { meter_id: meter.id });
    // Money was received; keep it for admin retry. Acknowledge to stop blind retries.
    return ack("0", "Payment recorded — token generation pending");
  }

  // 4. Mark completed before SMS so an SMS problem can never undo the sale.
  await db
    .from("ncba_notifications")
    .update({ status: "completed", meter_id: meter.id, token_id: tokenRow.id, processed_at: new Date().toISOString() })
    .eq("id", rowId);

  let smsStatus = "Skipped - No Mobile Number";
  if (p.Mobile) {
    const { sendTokenReceiptSms } = await import("@/lib/sms-receipt.server");
    try {
      const sms = await sendTokenReceiptSms(db, { tokenId: tokenRow.id, phone: p.Mobile, actorId: null });
      smsStatus =
        sms.status === "sent"
          ? "Submitted"
          : /not (set up|configured|enabled)|no sms|turned on|no owner/i.test(sms.message)
            ? "Skipped - SMS not configured"
            : `Failed - ${sms.message.slice(0, 200)}`;
    } catch (e) {
      smsStatus = `Failed - ${((e as Error).message || "SMS error").slice(0, 200)}`;
    }
  }
  await db.from("ncba_notifications").update({ sms_status: smsStatus }).eq("id", rowId);

  return ack("0", "Success");
}
