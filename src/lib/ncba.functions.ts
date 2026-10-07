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
    let q = supabase.from("ncba_notifications").select("*").order("created_at", { ascending: false }).limit(200);
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
      id: r.id, trans_id: r.trans_id, trans_time: r.trans_time, trans_amount: Number(r.trans_amount ?? 0),
      narrative: r.narrative, bill_ref_number: r.bill_ref_number, mobile: r.mobile, status: r.status,
      error_code: r.error_code, error_message: r.error_message, sms_status: r.sms_status,
      attempts: r.attempts ?? 0, auto_retry_count: r.auto_retry_count ?? 0, next_retry_at: r.next_retry_at,
      token: r.token_id ? (tokens.get(r.token_id) ?? null) : null, created_at: r.created_at, updated_at: r.updated_at,
    }));
  });

/** Admin retry of one payment. Never re-vends a completed payment (TransID idempotency). */
export const retryNcbaPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { data: row } = await (context.supabase as any).from("ncba_notifications").select("status").eq("id", data.id).maybeSingle();
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
