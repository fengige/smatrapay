import { z } from "zod";

const money = z.union([z.number(), z.null()]).refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 100_000_000), "Enter an amount of 0 or more")
  .transform((v) => (v === null ? null : Math.round(v * 100) / 100));

export const PAYG_FREQUENCIES = ["daily", "weekly", "monthly"] as const;

export const paygProductSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Product name is required").max(120),
  description: z.string().trim().max(1000).nullable().transform((v) => (v ? v : null)),
  image_path: z.string().max(300).nullable(),
  price: money,
  down_payment: money,
  instalment_amount: money,
  instalment_frequency: z.enum(PAYG_FREQUENCIES).nullable(),
  instalment_count: z.number().int().min(1).max(1000).nullable(),
  is_active: z.boolean(),
}).superRefine((v, ctx) => {
  if (v.price !== null && v.down_payment !== null && v.down_payment > v.price)
    ctx.addIssue({ code: "custom", path: ["down_payment"], message: "Down payment cannot exceed the price" });
  if (v.instalment_amount !== null && !v.instalment_frequency)
    ctx.addIssue({ code: "custom", path: ["instalment_frequency"], message: "Choose how often instalments are paid" });
});

export type PaygProductInput = z.input<typeof paygProductSchema>;

/** A vendor may only reference images inside their own folder. */
export function ownsPaygImage(vendorId: string, path: string | null) {
  return path === null || (path.startsWith(`${vendorId}/`) && !path.includes(".."));
}

export type PaygProduct = {
  id: string; vendor_id: string; name: string; description: string | null; image_path: string | null; image_url: string | null;
  price: number | null; down_payment: number | null; instalment_amount: number | null;
  instalment_frequency: string | null; instalment_count: number | null; is_active: boolean; vendor_name?: string | null;
};
