import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertVendor } from "./vendor.server";
import { readAll } from "./landlord-scope.server";
import { trustedRecoveryUrl } from "./resident-password";
import { validateResidentImport, type ImportUnit, type ResidentImportInput } from "./resident-import";

export const importVendorResidents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ rows: z.array(z.object({ name: z.string().max(180), email: z.string().max(255), unit: z.string().max(200), property: z.string().max(200) })).min(1).max(200), confirm: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const actor = await assertVendor(context as never);
    const properties = await readAll(() => context.supabase.from("properties").select("id,name,status").order("id"));
    const units = await readAll(() => context.supabase.from("units").select("id,unit_number,property_id,status").order("id"));
    const assignments = await readAll(() => context.supabase.from("unit_assignments").select("unit_id,end_date").eq("role","resident").order("id"));
    const today = new Date().toISOString().slice(0,10);
    const occupied = new Set(assignments.filter(a => !a.end_date || a.end_date >= today).map(a => a.unit_id));
    const propertyMap = new Map(properties.filter(p => p.status !== "archived").map(p => [p.id,p]));
    const references: ImportUnit[] = units.filter(u => propertyMap.has(u.property_id)).map(u => ({ ...u, property_name: propertyMap.get(u.property_id)?.name ?? "", occupied: occupied.has(u.id) }));
    const results = validateResidentImport(data.rows as ResidentImportInput[], references);
    // Privileged access only after verifying the caller and resolving RLS-visible references.
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    for (const row of results) {
      if (!row.unitId || !row.propertyId) continue;
      const { data: existing, error: lookupError } = await admin.from("users").select("id,created_by").eq("email",row.values.email).maybeSingle();
      if (lookupError) { row.status="failed"; row.reason="Could not check this account"; continue; }
      if (existing) {
        const { data: link } = existing.created_by === actor ? await admin.from("unit_assignments").select("id").eq("user_id",existing.id).eq("unit_id",row.unitId).eq("role","resident").is("end_date",null).maybeSingle() : { data: null };
        row.status = link ? "skipped" : "failed";
        row.reason = link ? "Already imported and assigned to this unit" : "Account cannot be imported; use the existing resident management workflow";
        continue;
      }
      if (row.status !== "ready" || !data.confirm) continue;
      const { data: created, error } = await admin.auth.admin.createUser({ email: row.values.email, password: `${crypto.randomUUID()}Aa1!`, user_metadata: { name: row.values.name } });
      if (error || !created.user) { row.status="failed"; row.reason="Account could not be created; it may already exist"; continue; }
      const { error: completeError } = await admin.rpc("complete_vendor_resident_import", { p_actor: actor, p_resident: created.user.id, p_name: row.values.name, p_email: row.values.email, p_unit: row.unitId, p_property: row.propertyId });
      if (completeError) {
        const { error: cleanupError } = await admin.auth.admin.deleteUser(created.user.id);
        row.status="failed"; row.reason=cleanupError ? "Assignment failed; account cleanup needs administrator review" : "Assignment failed; unit availability or scope changed. Preview again.";
        continue;
      }
      row.status="successful";
      const { error: emailError } = await admin.auth.resetPasswordForEmail(row.values.email,{ redirectTo: trustedRecoveryUrl(getRequestHeader("origin")) });
      row.reason = emailError ? "Created and assigned; password setup email not sent. Use Send password reset." : "Created and assigned; password setup email sent";
    }
    return { results };
  });