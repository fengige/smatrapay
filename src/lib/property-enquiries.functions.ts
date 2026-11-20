import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { propertyEnquirySchema } from "./property-enquiries";

export const submitPropertyEnquiry = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => propertyEnquirySchema.parse(v))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { phoneHash } = await import("./resident-phone");
    const ip = getRequestHeader("cf-connecting-ip") ?? "unknown";
    for (const key of ["enquiry:ip:" + ip, "enquiry:email:" + data.email.toLowerCase()]) {
      const { data: ok, error } = await supabaseAdmin.rpc("consume_vendor_application_limit", { p_key: await phoneHash(key) });
      if (error || !ok) throw new Error("Too many enquiries. Please try again in an hour.");
    }
    const { error } = await supabaseAdmin.from("property_enquiries").insert({ ...data, email: data.email.toLowerCase() });
    if (error) { console.error("enquiry insert failed", error.code); throw new Error("Could not send your enquiry. Please try again."); }
    return { ok: true };
  });

export const listPropertyEnquiries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ q: z.string().max(100).default(""), page: z.number().int().min(1).default(1) }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!admin) throw new Error("Administrator access required");
    const limit = 20;
    let q = context.supabase.from("property_enquiries").select("*", { count: "exact" });
    const term = data.q.replace(/[^a-zA-Z0-9@ .+-]/g, "").trim();
    if (term) q = q.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%,city.ilike.%${term}%`);
    const { data: rows, count, error } = await q.order("created_at", { ascending: false }).order("id", { ascending: false }).range((data.page - 1) * limit, data.page * limit - 1);
    if (error) throw new Error("Could not load enquiries");
    return { rows: rows ?? [], total: count ?? 0, limit };
  });
