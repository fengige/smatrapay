import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertVendor } from "./vendor.server";
import { residentScope } from "./resident-portal.functions";
import { ownsPaygImage, paygProductSchema, type PaygProduct } from "./payg";

const COLS = "id, vendor_id, name, description, image_path, price, down_payment, instalment_amount, instalment_frequency, instalment_count, is_active";

async function withImages(rows: any[]): Promise<PaygProduct[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const paths = rows.map((r) => r.image_path).filter(Boolean);
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data } = await supabaseAdmin.storage.from("payg-products").createSignedUrls(paths, 600);
    for (const d of data ?? []) if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
  }
  return rows.map((r) => ({
    ...r,
    price: r.price === null ? null : Number(r.price),
    down_payment: r.down_payment === null ? null : Number(r.down_payment),
    instalment_amount: r.instalment_amount === null ? null : Number(r.instalment_amount),
    image_url: r.image_path ? urls.get(r.image_path) ?? null : null,
  }));
}

export const listVendorPaygProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const vendorId = await assertVendor(context as any);
    const { data, error } = await (context.supabase as any).from("payg_products").select(COLS).eq("vendor_id", vendorId).order("created_at", { ascending: false });
    if (error) throw new Error("Could not load products");
    return withImages(data ?? []);
  });

export const saveVendorPaygProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => paygProductSchema.parse(d))
  .handler(async ({ data, context }) => {
    const vendorId = await assertVendor(context as any);
    if (!ownsPaygImage(vendorId, data.image_path)) throw new Error("Invalid image");
    const { id, ...row } = data;
    const db = context.supabase as any;
    const q = id
      ? db.from("payg_products").update(row).eq("id", id).eq("vendor_id", vendorId).select("id").maybeSingle()
      : db.from("payg_products").insert({ ...row, vendor_id: vendorId }).select("id").single();
    const { data: saved, error } = await q;
    if (error || !saved) throw new Error("Could not save the product");
    return { id: saved.id as string };
  });

export const deleteVendorPaygProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const vendorId = await assertVendor(context as any);
    const db = context.supabase as any;
    const { data: row, error } = await db.from("payg_products").delete().eq("id", data.id).eq("vendor_id", vendorId).select("image_path").maybeSingle();
    if (error || !row) throw new Error("Could not delete the product");
    if (row.image_path) await db.storage.from("payg-products").remove([row.image_path]);
    return { ok: true };
  });

/** Residents see active products only from vendors that own a meter in their assigned units. */
export const listResidentPaygProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = await residentScope(context as any);
    const vendorIds = [...new Set(s.meters.map((m: any) => m.vendor_id).filter((v: any) => v && /^[0-9a-f-]{36}$/i.test(v)))] as string[];
    if (!vendorIds.length) return [];
    const { data, error } = await s.db.from("payg_products").select(COLS).in("vendor_id", vendorIds).eq("is_active", true).order("created_at", { ascending: false });
    if (error) throw new Error("Could not load products");
    const { data: vendors } = await s.db.from("users").select("id, name").in("id", vendorIds);
    const names = new Map((vendors ?? []).map((v: any) => [v.id, v.name]));
    const rows = (await withImages(data ?? [])).map((p) => ({ ...p, vendor_name: (names.get(p.vendor_id) as string) ?? null }));
    return rows;
  });
