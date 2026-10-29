import { z } from "zod";

export const paygApplicationSchema = z.object({
  product_id: z.string().uuid(),
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(/^(?:254|0)?[17]\d{8}$/, "Enter a Kenyan phone number"),
  delivery_address: z.string().trim().min(5).max(500),
  notes: z.string().trim().max(1000).default(""),
  accepted_terms: z.literal(true, { error: "Accept the payment plan before applying" }),
});

export type PaygApplication = {
  id: string; product_id: string; vendor_id: string; resident_id: string;
  product_name: string; full_name: string; phone: string; delivery_address: string;
  notes: string; status: "pending" | "approved" | "declined";
  review_note: string | null; created_at: string;
};

export function canApplyForPayg(product: { approval_status?: string; is_active: boolean; deleted_at?: string | null }) {
  return product.approval_status === "approved" && product.is_active && !product.deleted_at;
}

export function canPayApprovedApplication(status: string | undefined) { return status === "approved"; }

/** No platform fallback: the configured receiving shortcode must belong to this vendor. */
export function isVendorPaygConfig(config: { owner_id?: string | null; enabled?: boolean; stk_enabled?: boolean; country?: string; currency?: string; environment?: string } | null, vendorId: string) {
  return Boolean(config && config.owner_id === vendorId && config.enabled && config.stk_enabled && config.country === "KE" && config.currency === "KES" && config.environment === "production");
}