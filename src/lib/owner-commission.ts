import { z } from "zod";

export const ownerCommissionKey = ["admin-owner-commission"] as const;
export const ownerCommissionTargetsKey = ["admin-owner-commission-targets"] as const;
export const commissionOwnerType = z.enum(["landlord", "vendor", "agent"]);
const configuration = z.object({
  owner_id: z.string().uuid(),
  /** null/absent = applies to all of the owner's properties. */
  property_id: z.string().uuid().nullable().optional(),
  commission_payer: z.enum(["owner", "resident"]),
  commission_percentage: z.number().finite().min(0).max(100),
  vat_on_commission_percentage: z.number().finite().min(0).max(100),
});
export const ownerCommissionInput = configuration.extend({
  owner_type: commissionOwnerType,
  property_scope: z.enum(["all", "specific"]),
}).superRefine((value, ctx) => {
  if (value.property_scope === "specific" && !value.property_id) ctx.addIssue({ code: "custom", path: ["property_id"], message: "Select a property" });
  if (value.property_scope === "all" && value.property_id) ctx.addIssue({ code: "custom", path: ["property_id"], message: "All Properties cannot target a specific property" });
});
export type CommissionOwnerType = z.infer<typeof commissionOwnerType>;
export type CommissionOption = { id: string; name: string };
export type OwnerCommission = z.infer<typeof configuration> & {
  owner_type?: CommissionOwnerType | null;
  property_scope?: "all" | "specific";
  updated_at: string;
  updated_by: string | null;
};

export function assertCommissionTarget(input: z.infer<typeof ownerCommissionInput>, owners: CommissionOption[], properties: CommissionOption[]) {
  if (!owners.some(owner => owner.id === input.owner_id)) throw new Error("Select an account matching the owner type");
  if (!properties.length) throw new Error("The selected owner has no linked properties");
  if (input.property_scope === "specific" && !properties.some(property => property.id === input.property_id)) throw new Error("Select a property linked to this owner");
}

export function changeCommissionTarget(current: { owner_type: CommissionOwnerType | ""; owner_id: string; property_scope: "all" | "specific" | ""; property_id: string }, change: { owner_type: CommissionOwnerType | "" } | { owner_id: string } | { property_scope: "all" | "specific" | "" }) {
  if ("owner_type" in change) return { ...current, ...change, owner_id: "", property_id: "", property_scope: "" as const };
  if ("owner_id" in change) return { ...current, ...change, property_id: "", property_scope: "" as const };
  return { ...current, ...change, property_id: "" };
}

/** Exact configuration saved for an owner scope (specific property, or all properties when propertyId is null). */
export function commissionForScope(ownerId: string, propertyId: string | null, settings: OwnerCommission[]) {
  return settings.find(s => s.owner_id === ownerId && (s.property_id ?? null) === propertyId) ?? null;
}

/**
 * Join by authoritative owner account, never management vendor or global defaults.
 * A property-specific configuration takes precedence over the owner's all-properties configuration.
 */
export function commissionForOwner(ownerId: string | null, settings: OwnerCommission[], propertyId: string | null = null) {
  if (!ownerId) return null;
  return (propertyId ? commissionForScope(ownerId, propertyId, settings) : null) ?? commissionForScope(ownerId, null, settings);
}
