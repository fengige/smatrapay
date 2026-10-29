import { z } from "zod";

export const DEFAULT_PAYG_SUMMARY = `Pay-as-you-go plan gives you the flexibility to spread the cost of your Sun King product over a series of small payments.

Here’s how it works:

1. First, you make a small down payment and can start using your product immediately
2. Then, you pay the balance in small instalments
3. Making payments keeps the product unlocked and ready to use
4. Once payments are complete, enjoy the benefits of solar free of charge!`;

export const paygSummarySchema = z.object({
  summary_text: z.string().trim().min(1, "Summary details are required").max(10000, "Use no more than 10,000 characters"),
}).strict();

export function paygVendorIds(meters: { vendor_id?: string | null }[]): string[] {
  return [...new Set(meters.map(m => m.vendor_id).filter((id): id is string => Boolean(id && /^[0-9a-f-]{36}$/i.test(id))))];
}

export function resolvePaygSummaries(vendorIds: string[], rows: { vendor_id: string; summary_text: string }[], vendors: { id: string; name: string | null }[]) {
  return vendorIds.map(vendor_id => ({
    vendor_id,
    vendor_name: vendors.find(v => v.id === vendor_id)?.name ?? null,
    summary_text: rows.find(r => r.vendor_id === vendor_id)?.summary_text ?? DEFAULT_PAYG_SUMMARY,
  }));
}