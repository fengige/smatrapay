import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canTransitionEnquiry, enquiryDecision, enquiryReply, inboxFilters, mayReadResidentInbox } from "./resident-inbox";

async function authorize(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error || !mayReadResidentInbox(data ? ["admin"] : [])) throw new Error("Admin access required");
}

async function auditDecision(enquiryId: string, actorId: string, action: string, details: Record<string, string | null>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("user_audit_logs").insert({
    user_id: actorId, actor_id: actorId, action: `resident_enquiry_${action}`,
    changes: { enquiry_id: enquiryId, ...details },
  });
}

export type InboxRow = {
  id: string; resident_id: string; resident_name: string; created_at: string;
  reference: string | null; kind: string | null; subject: string | null; message: string | null;
  status: string | null; staff_response: string | null;
  category: string | null; rating: number | null; comment: string | null;
};

export const listResidentInbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inboxFilters.parse(d))
  .handler(async ({ data, context }) => {
    await authorize(context);
    const feedback = data.tab === "feedback";
    let enquiries = context.supabase.from("resident_enquiries").select("id, resident_id, reference, kind, subject, message, status, staff_response, created_at", { count: "exact" });
    if (data.kind) enquiries = enquiries.eq("kind", data.kind);
    if (data.status) enquiries = enquiries.eq("status", data.status);
    let q = feedback
      ? context.supabase.from("resident_feedback").select("id, resident_id, category, rating, comment, created_at", { count: "exact" })
      : enquiries;
    if (data.q) {
      const term = `%${data.q.replace(/[,()%.*]/g, " ")}%`;
      q = q.or(feedback ? `category.ilike.${term},comment.ilike.${term}` : `reference.ilike.${term},subject.ilike.${term},message.ilike.${term}`);
    }
    const start = (data.page - 1) * 20;
    const { data: rows, error, count } = await q.order("created_at", { ascending: false }).order("id").range(start, start + 19);
    if (error) throw new Error("Could not load resident messages");
    const ids = [...new Set((rows ?? []).map((r) => r.resident_id))];
    const { data: users, error: nameError } = ids.length
      ? await context.supabase.from("users").select("id, name").in("id", ids) : { data: [], error: null };
    if (nameError) throw new Error("Could not load resident names");
    const names = new Map((users ?? []).map((u) => [u.id, u.name]));
    return { total: count ?? 0, rows: (rows ?? []).map((r): InboxRow => ({
      reference: null, kind: null, subject: null, message: null, status: null, staff_response: null,
      category: null, rating: null, comment: null, ...r, resident_name: names.get(r.resident_id) || "Resident",
    })) };
  });

export const replyResidentEnquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => enquiryReply.parse(d))
  .handler(async ({ data, context }) => {
    await authorize(context);
    const { data: row, error } = await context.supabase.from("resident_enquiries")
      .update({ staff_response: data.response }).eq("id", data.id).select("id").maybeSingle();
    if (error || !row) throw new Error("Could not save the reply");
    return { ok: true };
  });

export const decideResidentEnquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => enquiryDecision.parse(d))
  .handler(async ({ data, context }) => {
    await authorize(context);
    if (!canTransitionEnquiry(data.from, data.to)) throw new Error("That status change is not allowed");
    // Compare-and-set on the current status so two admins cannot decide the same enquiry twice.
    const { data: row, error } = await context.supabase.from("resident_enquiries")
      .update({
        status: data.to,
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
        ...(data.response ? { staff_response: data.response } : {}),
      })
      .eq("id", data.id).eq("status", data.from).select("id, reference").maybeSingle();
    if (error) throw new Error("Could not update the enquiry");
    if (!row) throw new Error("This enquiry was already updated by someone else — refresh and try again");
    await auditDecision(data.id, context.userId, data.to, { reference: row.reference ?? null, from: data.from });
    return { ok: true };
  });