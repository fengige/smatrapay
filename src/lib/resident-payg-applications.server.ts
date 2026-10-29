import { readResidentPaygPlans } from "./payg-plans.server";
import type { PaygApplication } from "./payg-approval";

/** The RLS-bound application proves ownership before any service-only history read. */
export async function readResidentPaygApplicationDetail(db: any, paymentDb: any, residentId: string, id: string) {
  const { data, error } = await db.from("payg_applications")
    .select("id,product_id,vendor_id,resident_id,product_name,full_name,phone,delivery_address,notes,status,review_note,reviewed_at,created_at")
    .eq("resident_id", residentId).eq("id", id).maybeSingle();
  if (error || !data || data.resident_id !== residentId) throw new Error("Application not found.");
  const application = data as PaygApplication & { reviewed_at: string | null };
  const plans = await readResidentPaygPlans(paymentDb, residentId);
  const { data: events, error: eventError } = await paymentDb.from("payg_review_events")
    .select("action,note,created_at").eq("entity_id", application.id)
    .in("action", ["approved", "declined", "vendor_approved", "vendor_declined"]).order("created_at");
  if (eventError) throw new Error("Could not load application history.");
  return { application, plan: plans.find(p => p.application_id === application.id) ?? null,
    events: (events ?? []) as { action: string; note: string | null; created_at: string }[] };
}