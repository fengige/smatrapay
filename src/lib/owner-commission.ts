import { z } from "zod";

export const ownerCommissionKey = ["admin-owner-commission"] as const;
export const ownerCommissionInput = z.object({
  owner_id: z.string().uuid(),
  /** null/absent = applies to all of the owner's properties. */
  property_id: z.string().uuid().nullable().optional(),
  commission_payer: z.enum(["owner", "resident"]),
  commission_percentage: z.number().finite().min(0).max(100),
  vat_on_commission_percentage: z.number().finite().min(0).max(100),
});
export type OwnerCommission = z.infer<typeof ownerCommissionInput> & {
  updated_at: string;
  updated_by: string | null;
};

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
