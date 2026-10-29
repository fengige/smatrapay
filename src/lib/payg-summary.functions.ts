import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertVendor } from "./vendor.server";
import { residentScope } from "./resident-portal.functions";
import { DEFAULT_PAYG_SUMMARY, paygSummarySchema, paygVendorIds, resolvePaygSummaries } from "./payg-summary";

export const getVendorPaygSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const vendorId = await assertVendor(context);
    const { data, error } = await context.supabase.from("payg_service_summaries")
      .select("summary_text").eq("vendor_id", vendorId).maybeSingle();
    if (error) throw new Error("Could not load summary details");
    return { summary_text: data?.summary_text ?? DEFAULT_PAYG_SUMMARY };
  });

export const saveVendorPaygSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => paygSummarySchema.parse(data))
  .handler(async ({ data, context }) => {
    const vendorId = await assertVendor(context);
    const { data: saved, error } = await context.supabase.from("payg_service_summaries")
      .upsert({ vendor_id: vendorId, summary_text: data.summary_text }, { onConflict: "vendor_id" })
      .select("summary_text").single();
    if (error || !saved) throw new Error("Could not save summary details");
    return saved;
  });

export const listResidentPaygSummaries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const scope = await residentScope(context);
    const vendorIds = paygVendorIds(scope.meters);
    if (!vendorIds.length) return [];
    // Summary reads stay user/RLS-bound, even though the existing scope helper uses privileged relationship reads.
    const { data, error } = await context.supabase.from("payg_service_summaries")
      .select("vendor_id, summary_text").in("vendor_id", vendorIds);
    if (error) throw new Error("Could not load summary details");
    const { data: vendors, error: vendorError } = await scope.db.from("users").select("id, name").in("id", vendorIds);
    if (vendorError) throw new Error("Could not load summary details");
    return resolvePaygSummaries(vendorIds, data ?? [], vendors ?? []);
  });