import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  applicationListSchema,
  vendorRegistrationSchema,
  vendorReviewSchema,
} from "./vendor-registration";

export const submitVendorRegistration = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => vendorRegistrationSchema.parse(v))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { submitRegistration } = await import("./vendor-registration.server");
    return submitRegistration(
      supabaseAdmin,
      data,
      getRequestHeader("cf-connecting-ip") ?? "unknown",
    );
  });
export const listRegistrationApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => applicationListSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { requireRegistrationAdmin } = await import("./vendor-registration.server");
    await requireRegistrationAdmin(context.supabase, context.userId);
    let q = context.supabase
      .from("vendor_applications")
      .select(
        "id,reference,business_name,contact_name,email,phone,status,submitted_at,email_status,sms_status",
        { count: "exact" },
      );
    if (data.status !== "All") q = q.eq("status", data.status);
    const term = data.q.replace(/[^a-zA-Z0-9@ .+-]/g, "");
    if (term)
      q = q.or(
        `business_name.ilike.%${term}%,contact_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%,reference.ilike.%${term}%`,
      );
    const {
      data: rows,
      count,
      error,
    } = await q
      .order("submitted_at", { ascending: false })
      .order("id", { ascending: false })
      .range((data.page - 1) * data.limit, data.page * data.limit - 1);
    if (error) throw new Error("Could not load applications");
    return { rows: rows ?? [], total: count ?? 0 };
  });
const idSchema = z.object({ id: z.string().uuid() });
export const getRegistrationApplication = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => idSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { requireRegistrationAdmin } = await import("./vendor-registration.server");
    await requireRegistrationAdmin(context.supabase, context.userId);
    const { data: application, error } = await context.supabase
      .from("vendor_applications")
      .select("*")
      .eq("id", data.id)
      .single();
    const { data: events, error: eventsError } = await context.supabase
      .from("vendor_application_events")
      .select("*")
      .eq("application_id", data.id)
      .order("created_at", { ascending: true });
    if (error || eventsError || !application) throw new Error("Application could not be loaded");
    return { application, events: events ?? [] };
  });
export const reviewRegistrationApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => vendorReviewSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { requireRegistrationAdmin, provisionApplication, notifyApplication } =
      await import("./vendor-registration.server");
    await requireRegistrationAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: a, error } = await supabaseAdmin.rpc("claim_vendor_application_review", {
      p_id: data.id,
      p_actor: context.userId,
      p_decision: data.decision,
      p_reason: data.reason,
    });
    if (error || !a) throw new Error(error?.message ?? "Could not review application");
    if (data.decision === "Accepted") {
      try {
        await provisionApplication(supabaseAdmin, a, context.userId);
      } catch (e) {
        await supabaseAdmin
          .from("vendor_applications")
          .update({ processing_at: null, processing_by: null })
          .eq("id", a.id)
          .eq("processing_by", context.userId);
        await supabaseAdmin
          .from("vendor_application_events")
          .insert({
            application_id: a.id,
            actor_id: context.userId,
            event_type: "Acceptance incomplete",
            detail: "Reserved identity retained for safe retry; no credentials recorded.",
          });
        throw e;
      }
    }
    return notifyApplication(supabaseAdmin, data.id, context.userId);
  });
export const retryRegistrationNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => idSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { requireRegistrationAdmin, notifyApplication } =
      await import("./vendor-registration.server");
    await requireRegistrationAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return notifyApplication(supabaseAdmin, data.id, context.userId);
  });
