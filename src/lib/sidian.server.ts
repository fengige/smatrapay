import { z } from "zod";
import { ack, parseNcbaAmount, safeEqual, vendNcbaNotification, processDueNcbaRetries } from "./ncba.server";

/**
 * Sidian Bank C2B confirmation processing.
 *
 * Bank-specific: Basic Auth + shortcode + payload validation.
 * Shared with NCBA: payment record/retry queue, vendMeterToken (commission,
 * VAT on commission, units, vending software) and owner SMS receipts.
 */

export const SIDIAN_BANK = "SIDIAN";
export const SIDIAN_TRANSACTION_TYPES = ["C2B_CONFIRMATION"];

/**
 * Which ConfirmationRequest.status values mean a confirmed payment.
 * Not yet confirmed against Sidian's contract — change here only.
 */
export const SIDIAN_SUCCESS_STATUSES = [0];
export const isSidianPaymentConfirmed = (status: number) => SIDIAN_SUCCESS_STATUSES.includes(status);

const str = (max: number) => z.union([z.string(), z.number()]).transform((v) => String(v).trim()).pipe(z.string().min(1).max(max));

export const sidianPayload = z.object({
  ConfirmationRequest: z.object({
    status: z.union([z.number(), z.string()]).transform((v) => Number(v)).pipe(z.number().int()),
    data: z.object({
      Reference: str(64),
      Amount: str(20),
      Date: str(40),
      BusinessShortCode: str(20),
      MSISDN: z.union([z.string(), z.number()]).transform((v) => String(v).trim()).pipe(z.string().max(20)),
      Names: z.string().max(120).optional().nullable(),
      Account: str(64),
      Narration: z.string().max(255).optional().nullable(),
    }),
    TransactionType: z.string().trim().min(1),
    TrasactionID: str(64),
  }),
});
export type SidianPayload = z.infer<typeof sidianPayload>;

export type SidianAuthConfig = { username: string; password: string; shortcode: string };

/** Reads HTTP Basic credentials; never logged. */
export function parseBasicAuth(header: string | null): { user: string; pass: string } | null {
  if (!header || !/^basic\s+/i.test(header)) return null;
  try {
    const decoded = atob(header.replace(/^basic\s+/i, "").trim());
    const i = decoded.indexOf(":");
    return i < 0 ? null : { user: decoded.slice(0, i), pass: decoded.slice(i + 1) };
  } catch {
    return null;
  }
}

export function checkSidianAuth(authHeader: string | null, cfg: SidianAuthConfig): boolean {
  const c = parseBasicAuth(authHeader);
  const userOk = safeEqual(c?.user ?? "", cfg.username);
  const passOk = safeEqual(c?.pass ?? "", cfg.password);
  return !!c && userOk && passOk;
}

/** Validation after auth. Returns an error code or null. */
export function checkSidianPayload(p: SidianPayload, cfg: SidianAuthConfig): string | null {
  const r = p.ConfirmationRequest;
  if (!SIDIAN_TRANSACTION_TYPES.includes(r.TransactionType)) return "TRANS_TYPE_UNSUPPORTED";
  if (r.data.BusinessShortCode !== cfg.shortcode) return "SHORTCODE_INVALID";
  if (parseNcbaAmount(r.data.Amount) === null) return "AMOUNT_INVALID";
  return null;
}

export async function processSidianNotification(p: SidianPayload) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const r = p.ConfirmationRequest;
  const amount = parseNcbaAmount(r.data.Amount)!;
  const confirmed = isSidianPaymentConfirmed(r.status);

  const { data: existing } = await db
    .from("ncba_notifications").select("*").eq("bank", SIDIAN_BANK).eq("trans_id", r.TrasactionID).maybeSingle();
  if (existing?.status === "completed") return ack("0", "Duplicate notification — already processed");
  if (existing?.status === "rejected") return ack("0", "Duplicate notification — already recorded");
  if (existing?.status === "processing" && Date.now() - new Date(existing.updated_at).getTime() < 120_000)
    return ack("1", "Notification is being processed — retry later", 409);

  const record = {
    bank: SIDIAN_BANK,
    trans_id: r.TrasactionID,
    trans_type: r.TransactionType,
    bank_reference: r.data.Reference,
    ft_ref: r.data.Reference,
    payment_status: String(r.status),
    trans_time: r.data.Date,
    trans_amount: amount,
    business_short_code: r.data.BusinessShortCode,
    bill_ref_number: r.data.Account,
    narrative: r.data.Narration?.trim() || null,
    mobile: r.data.MSISDN || null,
    payer_name: r.data.Names?.trim() || null,
    meter_number: r.data.Account,
    status: confirmed ? "processing" : "rejected",
    attempts: (existing?.attempts ?? 0) + 1,
    error_code: confirmed ? null : "PAYMENT_NOT_CONFIRMED",
    error_message: confirmed ? null : `Sidian reported status ${r.status}; no token issued.`,
  };
  const saved = existing
    ? await db.from("ncba_notifications").update(record).eq("id", existing.id).select("id").single()
    : await db.from("ncba_notifications").insert(record).select("id").single();
  if (saved.error) {
    if (/duplicate|unique/i.test(saved.error.message)) return ack("1", "Notification is being processed — retry later", 409);
    return ack("1", "Could not record the notification — retry later", 500);
  }
  if (!confirmed) return ack("0", "Notification recorded — payment not confirmed");

  const result = await vendNcbaNotification(saved.data.id);
  try { await processDueNcbaRetries(3); } catch { /* never affects this payment */ }
  if (result.status === "completed") return ack("0", "Success");
  return ack("0", "Payment recorded — token generation pending");
}

export type SidianResolution =
  | { kind: "candidates"; configs: SidianAuthConfig[]; source: "owner" | "shortcode" | "global" }
  | { kind: "disabled" }
  | { kind: "none" };

/**
 * Finds which Sidian credentials may sign this notification: the meter owner's
 * own Sidian Bank account (landlord -> agent -> vendor), else accounts using the
 * notified shortcode, else the platform-wide fallback secrets.
 */
export async function resolveSidianConfig(meterNumber: string, shortcode: string): Promise<SidianResolution> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const load = async (filter: (q: any) => any) => {
    const { data } = await filter(
      db.from("payment_account_sidian_settings").select("owner_id, username, password, business_shortcode, payment_method_accounts!inner(is_active, is_default)"),
    );
    return (data ?? []) as any[];
  };

  const { data: meter } = await db.from("meters").select("landlord_id, agent_id, vendor_id").eq("meter_number", meterNumber).maybeSingle();
  const owners = [meter?.landlord_id, meter?.agent_id, meter?.vendor_id].filter(Boolean).map(String);
  if (owners.length) {
    const rows = await load((q) => q.in("owner_id", owners));
    for (const owner of owners) {
      const mine = rows.filter((r) => r.owner_id === owner);
      if (!mine.length) continue;
      const active = mine.filter((r) => r.payment_method_accounts?.is_active);
      if (!active.length) return { kind: "disabled" };
      active.sort((a, b) => Number(!!b.payment_method_accounts?.is_default) - Number(!!a.payment_method_accounts?.is_default));
      return { kind: "candidates", source: "owner", configs: active.map((r) => ({ username: r.username, password: r.password, shortcode: r.business_shortcode })) };
    }
  }

  const byCode = (await load((q) => q.eq("business_shortcode", shortcode))).filter((r) => r.payment_method_accounts?.is_active);
  if (byCode.length)
    return { kind: "candidates", source: "shortcode", configs: byCode.map((r) => ({ username: r.username, password: r.password, shortcode: r.business_shortcode })) };

  const g = { username: process.env["SIDIAN_USERNAME"] ?? "", password: process.env["SIDIAN_PASSWORD"] ?? "", shortcode: process.env["SIDIAN_SHORTCODE"] ?? "" };
  if (g.username && g.password && g.shortcode) return { kind: "candidates", source: "global", configs: [g] };
  return { kind: "none" };
}

/** The credential set the request authenticated with, or null. Checks every candidate (no early exit). */
export function matchSidianAuth(authHeader: string | null, configs: SidianAuthConfig[]): SidianAuthConfig | null {
  let hit: SidianAuthConfig | null = null;
  for (const c of configs) if (checkSidianAuth(authHeader, c) && !hit) hit = c;
  return hit;
}
