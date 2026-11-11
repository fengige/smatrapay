import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { readAll } from "./landlord-scope.server";
import { assertCommissionTarget, commissionOwnerType, ownerCommissionInput, type CommissionOption, type CommissionOwnerType, type OwnerCommission } from "./owner-commission";
import { readPricingRelated } from "./price-management-read.server";

async function authorize(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error || !data) throw new Error("Administrator access required");
}

const normalize = (row: any, property_id: string | null): OwnerCommission => ({
  ...row,
  property_id,
  commission_percentage: Number(row.commission_percentage),
  vat_on_commission_percentage: Number(row.vat_on_commission_percentage),
});
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

async function readOwners(db: any, ownerType: CommissionOwnerType): Promise<CommissionOption[]> {
  const roles = await readAll(() => db.from("user_roles").select("user_id").eq("role", ownerType).order("id"));
  const owners = await readPricingRelated(db, "users", "id,name", roles.map(role => role.user_id));
  return owners.map(owner => ({ id: owner.id, name: owner.name || "Unnamed owner" })).sort((a, b) => a.name.localeCompare(b.name));
}

async function readProperties(db: any, ownerType: CommissionOwnerType, ownerId: string): Promise<CommissionOption[]> {
  const properties = await readAll(() => db.rpc("owner_commission_linked_properties", { p_owner: ownerId, p_type: ownerType }).select("id,name").order("id"));
  return properties.map(property => ({ id: property.id, name: property.name || "Unnamed property" })).sort((a, b) => a.name.localeCompare(b.name));
}

export const listCommissionOwners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ owner_type: commissionOwnerType }).parse(input))
  .handler(async ({ data, context }) => {
    await authorize(context);
    return readOwners(context.supabase, data.owner_type);
  });

export const listCommissionProperties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ owner_type: commissionOwnerType, owner_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await authorize(context);
    return readProperties(context.supabase, data.owner_type, data.owner_id);
  });

export const listOwnerCommissionSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OwnerCommission[]> => {
    await authorize(context);
    const [all, byProperty] = await Promise.all([
      readAll(() => context.supabase.from("owner_commission_settings").select("*").order("owner_id")),
      readAll(() => context.supabase.from("owner_property_commission_settings").select("*").order("owner_id").order("property_id")),
    ]);
    return [...all.map((r: any) => normalize(r, null)), ...byProperty.map((r: any) => normalize(r, r.property_id))];
  });

export const saveOwnerCommissionSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ownerCommissionInput.parse(input))
  .handler(async ({ data, context }): Promise<OwnerCommission> => {
    await authorize(context);
    const [owners, properties] = await Promise.all([
      readOwners(context.supabase, data.owner_type),
      readProperties(context.supabase, data.owner_type, data.owner_id),
    ]);
    assertCommissionTarget(data, owners, properties);
    const values = {
      owner_id: data.owner_id,
      owner_type: data.owner_type,
      property_scope: data.property_scope,
      commission_payer: data.commission_payer,
      commission_percentage: round(data.commission_percentage),
      vat_on_commission_percentage: round(data.vat_on_commission_percentage),
    };
    if (data.property_id) {
      const { data: saved, error } = await context.supabase.from("owner_property_commission_settings")
        .upsert({ ...values, property_id: data.property_id }).select("*").single();
      if (error || !saved) throw new Error("Could not save owner commission settings");
      return normalize(saved, saved.property_id);
    }
    const { data: saved, error } = await context.supabase.from("owner_commission_settings").upsert(values).select("*").single();
    if (error || !saved) throw new Error("Could not save owner commission settings");
    return normalize(saved, null);
  });

export const getOwnerCommissionHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ owner_id: z.string().uuid(), property_id: z.string().uuid().nullable().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    await authorize(context);
    let q = context.supabase.from("owner_commission_settings_history")
      .select("id,previous_configuration,new_configuration,created_at").eq("owner_id", data.owner_id);
    q = data.property_id ? q.eq("property_id", data.property_id) : q.is("property_id", null);
    const { data: history, error } = await q.order("created_at", { ascending: false }).order("id").limit(50);
    if (error) throw new Error("Could not load owner commission history");
    return history ?? [];
  });
