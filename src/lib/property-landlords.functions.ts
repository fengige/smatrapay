import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({ property_id: z.string().uuid() });
const pair = input.extend({ landlord_id: z.string().uuid() });

async function assertManage(supabase: any, propertyId: string) {
  const { data, error } = await supabase.rpc("can_manage_property_landlords", { p_property: propertyId });
  if (error || !data) throw new Error("You can't manage owners for this property");
}

/** Landlords assigned to a property (full property reporting access). */
export const listPropertyLandlords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    await assertManage(supabase, data.property_id);
    const { data: rows, error } = await supabase.from("property_landlords")
      .select("landlord_id, created_at").eq("property_id", data.property_id).order("created_at");
    if (error) throw new Error(error.message);
    const ids = (rows ?? []).map((r: any) => r.landlord_id);
    const { data: users } = ids.length
      ? await supabase.from("users").select("id, name, email, phone").in("id", ids)
      : { data: [] };
    const byId = new Map((users ?? []).map((u: any) => [u.id, u]));
    return (rows ?? []).map((r: any) => {
      const u: any = byId.get(r.landlord_id);
      return { id: r.landlord_id as string, name: (u?.name ?? null) as string | null, email: (u?.email ?? null) as string | null, phone: (u?.phone ?? null) as string | null, assigned_at: r.created_at as string };
    });
  });

export const assignPropertyLandlord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => pair.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertManage(supabase, data.property_id);
    const { data: visible } = await supabase.from("users").select("id").eq("id", data.landlord_id).maybeSingle();
    if (!visible) throw new Error("Landlord not found in your account");
    const { error } = await supabase.from("property_landlords").insert({ ...data, assigned_by: userId });
    if (error && error.code !== "23505") {
      console.error("assignPropertyLandlord", error.code, error.message);
      throw new Error(error.code === "42501" ? "You can only assign landlords to properties you manage" : "Could not assign landlord");
    }
    return { ok: true };
  });

export const removePropertyLandlord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => pair.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    await assertManage(supabase, data.property_id);
    const { error } = await supabase.from("property_landlords").delete()
      .eq("property_id", data.property_id).eq("landlord_id", data.landlord_id);
    if (error) throw new Error("Could not remove landlord");
    return { ok: true };
  });
