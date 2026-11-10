import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { readAll } from "./landlord-scope.server";
import { ownerCommissionInput, type OwnerCommission } from "./owner-commission";

async function authorize(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error || !data) throw new Error("Administrator access required");
}

export const listOwnerCommissionSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OwnerCommission[]> => {
    await authorize(context);
    const rows = await readAll(() => context.supabase.from("owner_commission_settings").select("*").order("owner_id"));
    return rows.map(row => ({ ...row, commission_percentage: Number(row.commission_percentage), vat_on_commission_percentage: Number(row.vat_on_commission_percentage) }));
  });

export const saveOwnerCommissionSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ownerCommissionInput.parse(input))
  .handler(async ({ data, context }): Promise<OwnerCommission> => {
    await authorize(context);
    const { data: owner, error: ownerError } = await context.supabase.from("users").select("id").eq("id", data.owner_id).maybeSingle();
    if (ownerError || !owner) throw new Error("Owner account not found");
    const { data: saved, error } = await context.supabase.from("owner_commission_settings").upsert({
      ...data,
      commission_percentage: Math.round((data.commission_percentage + Number.EPSILON) * 100) / 100,
      vat_on_commission_percentage: Math.round((data.vat_on_commission_percentage + Number.EPSILON) * 100) / 100,
    }).select("*").single();
    if (error || !saved) throw new Error("Could not save owner commission settings");
    return saved;
  });

export const getOwnerCommissionHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ owner_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await authorize(context);
    const { data: history, error } = await context.supabase.from("owner_commission_settings_history")
      .select("id,previous_configuration,new_configuration,created_at").eq("owner_id", data.owner_id)
      .order("created_at", { ascending: false }).order("id").limit(50);
    if (error) throw new Error("Could not load owner commission history");
    return history ?? [];
  });