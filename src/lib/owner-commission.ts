import { z } from "zod";

export const ownerCommissionKey = ["admin-owner-commission"] as const;
export const ownerCommissionInput = z.object({
  owner_id: z.string().uuid(),
  commission_payer: z.enum(["owner", "resident"]),
  commission_percentage: z.number().finite().min(0).max(100),
  vat_on_commission_percentage: z.number().finite().min(0).max(100),
});
export type OwnerCommission = z.infer<typeof ownerCommissionInput> & {
  updated_at: string;
  updated_by: string | null;
};

/** Join by authoritative owner account, never management vendor or global defaults. */
export function commissionForOwner(ownerId: string | null, settings: OwnerCommission[]) {
  return ownerId ? settings.find(setting => setting.owner_id === ownerId) ?? null : null;
}