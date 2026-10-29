import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { residentScope } from "./resident-portal.functions";
import { paygProductSchema } from "./payg";
import { withImages } from "./payg.functions";
import { paygTerms } from "./payg-payment";
import { canApplyForPayg, paygApplicationSchema, type PaygApplication } from "./payg-approval";

async function admin(ctx: any) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error || !data) throw new Error("Admin access required");
  return ctx.supabase as any;
}

export const listAdminPaygProducts = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const db = await admin(context);
  const { data, error } = await db.from("payg_products").select("*").is("deleted_at", null).order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error("Could not load products");
  const ids = [...new Set((data ?? []).map((p: any) => p.vendor_id))];
  const { data: vendors } = ids.length ? await db.from("users").select("id,name").in("id", ids) : { data: [] };
  return withImages((data ?? []).map((p: any) => ({ ...p, vendor_name: vendors?.find((v: any) => v.id === p.vendor_id)?.name ?? "Vendor" })));
});

export const saveAdminPaygProduct = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => paygProductSchema.parse(d)).handler(async ({ context, data }) => {
  const db = await admin(context);
  if (!data.id) throw new Error("Choose a vendor product");
  const { id, image_path: _image, ...row } = data;
  const { data: saved, error } = await db.from("payg_products").update({ ...row, approval_status: "pending" }).eq("id", id).is("deleted_at", null).select("id").single();
  if (error || !saved) throw new Error("Could not update product");
  return { id };
});

export const reviewPaygProduct = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => z.object({ id: z.string().uuid(), action: z.enum(["approved", "declined", "deleted"]), note: z.string().trim().max(1000) }).parse(d)).handler(async ({ context, data }) => {
  const db = await admin(context);
  const { data: product } = await db.from("payg_products").select("*").eq("id", data.id).is("deleted_at", null).single();
  if (!product) throw new Error("Product not found");
  if (data.action === "approved") paygTerms(product);
  const patch = data.action === "deleted" ? { deleted_at: new Date().toISOString(), is_active: false } : { approval_status: data.action, review_note: data.note };
  const { error } = await db.from("payg_products").update(patch).eq("id", data.id);
  if (error) throw new Error("Could not review product");
  return { ok: true };
});

const applicationCols = "id,product_id,vendor_id,resident_id,product_name,full_name,phone,delivery_address,notes,status,review_note,created_at";
export const getResidentPaygApplications = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }): Promise<PaygApplication[]> => {
  await residentScope(context as any);
  const { data, error } = await (context.supabase as any).from("payg_applications").select(applicationCols).eq("resident_id", context.userId).order("created_at", { ascending: false });
  if (error) throw new Error("Could not load applications");
  return data ?? [];
});

export const submitPaygApplication = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => paygApplicationSchema.parse(d)).handler(async ({ context, data }) => {
  const s = await residentScope(context as any);
  const { data: product } = await s.db.from("payg_products").select("*").eq("id", data.product_id).maybeSingle();
  if (!product || !canApplyForPayg(product) || !s.meters.some(m => m.vendor_id === product.vendor_id)) throw new Error("Product not available");
  const { accepted_terms: _accepted, ...fields } = data;
  const { error } = await s.db.from("payg_applications").insert({ ...fields, resident_id: context.userId, vendor_id: product.vendor_id, product_name: product.name, terms: paygTerms(product) });
  if (error) throw new Error(error.code === "23505" ? "You already applied for this product. Check your application status." : "Could not submit application");
  return { ok: true };
});

export const listAdminPaygApplications = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }): Promise<PaygApplication[]> => {
  const db = await admin(context);
  const { data, error } = await db.from("payg_applications").select(applicationCols).order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error("Could not load applications");
  return data ?? [];
});

export const reviewPaygApplication = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["approved", "declined"]), note: z.string().trim().max(1000) }).parse(d)).handler(async ({ context, data }) => {
  const db = await admin(context);
  const { error } = await db.rpc("review_payg_application", { p_id: data.id, p_status: data.status, p_note: data.note });
  if (error) throw new Error("Could not review application. It may already be reviewed or its product may be unavailable.");
  return { ok: true };
});