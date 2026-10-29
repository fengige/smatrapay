import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { paygProgress, paygSchedule } from "./payg-payment";

async function vendorDb(ctx: any) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "vendor" });
  if (error || !data) throw new Error("Vendor access required");
  return ctx.supabase as any;
}

const cols = "id,product_id,resident_id,product_name,full_name,phone,delivery_address,notes,status,review_note,reviewed_at,created_at";

/** RLS limits rows to the signed-in vendor; the explicit vendor filter is defence in depth. */
export const listVendorPaygApplications = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const db = await vendorDb(context);
  const { data, error } = await db.from("payg_applications").select(cols).eq("vendor_id", context.userId).order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error("Could not load applications");
  const ids = (data ?? []).map((a: any) => a.id);
  const { data: plans } = ids.length ? await db.from("payg_plans").select("id,application_id").eq("vendor_id", context.userId).in("application_id", ids) : { data: [] };
  return (data ?? []).map((a: any) => ({ ...a, plan_id: (plans ?? []).find((p: any) => p.application_id === a.id)?.id ?? null })) as Array<{ id: string; product_id: string; resident_id: string; product_name: string; full_name: string; phone: string; delivery_address: string; notes: string; status: "pending" | "approved" | "declined"; review_note: string | null; reviewed_at: string | null; created_at: string; plan_id: string | null }>;
});

export const reviewVendorPaygApplication = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["approved", "declined"]), note: z.string().trim().max(1000) }).parse(d))
  .handler(async ({ context, data }) => {
    const db = await vendorDb(context);
    const { error } = await db.rpc("review_payg_application", { p_id: data.id, p_status: data.status, p_note: data.note });
    if (error) throw new Error(/approved/i.test(error.message) && /Product/.test(error.message) ? "This product is not currently approved and active, so the application cannot be approved." : "Could not review application. It may already have been reviewed.");
    return { ok: true };
  });

export const getVendorPaygApplicationDetail = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const db = await vendorDb(context);
    const { data: app } = await db.from("payg_applications").select(cols + ",terms").eq("id", data.id).eq("vendor_id", context.userId).maybeSingle();
    if (!app) throw new Error("Application not found");
    const { data: events } = await db.from("payg_review_events").select("action,note,created_at").eq("entity_id", app.id).order("created_at");
    const { data: plan } = await db.from("payg_plans").select("id,product_name,down_payment_cents,instalment_cents,instalment_count,frequency,total_cents,created_at").eq("application_id", app.id).eq("vendor_id", context.userId).maybeSingle();
    if (!plan) return { application: app, events: events ?? [], plan: null };
    // Payment attempts are service-only; ownership was proven above through the RLS-bound plan read.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: attempts, error } = await (supabaseAdmin as any).from("payg_payment_attempts").select("id,amount_cents,status,receipt,created_at,confirmed_at").eq("plan_id", plan.id).order("created_at", { ascending: false });
    if (error) throw new Error("Could not load payments");
    const progress = paygProgress(plan, attempts ?? []);
    return { application: app, events: events ?? [], plan: { ...plan, ...progress, schedule: paygSchedule(plan, progress.paid_cents), payments: (attempts ?? []).map((a: any) => ({ ...a, amount_cents: Number(a.amount_cents) })) } };
  });
