import { z } from "zod";

/** Money is converted from decimal strings, never multiplied as a float. */
export function paygCents(value: string | number): number {
  const text = String(value);
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error("Invalid plan amount");
  const [whole, fraction = ""] = text.split(".");
  const cents = BigInt(whole ?? "0") * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Plan amount too large");
  return Number(cents);
}

export function paygTerms(product: { down_payment: string | number | null; instalment_amount: string | number | null; instalment_count: number | null; instalment_frequency: string | null; price: string | number | null }) {
  if (product.down_payment === null || product.instalment_amount === null || !product.instalment_count || !product.instalment_frequency) throw new Error("This product does not have a complete payment plan yet.");
  if (!Number.isInteger(product.instalment_count) || product.instalment_count < 1 || product.instalment_count > 1000 || !["daily", "weekly", "monthly"].includes(product.instalment_frequency)) throw new Error("Invalid instalment schedule.");
  const down = paygCents(product.down_payment);
  const instalment = paygCents(product.instalment_amount);
  if (instalment <= 0 || down % 100 || instalment % 100) throw new Error("This plan needs whole-shilling M-Pesa amounts.");
  const total = down + instalment * product.instalment_count;
  if (!Number.isSafeInteger(total) || (product.price !== null && paygCents(product.price) !== total)) throw new Error("The product price and payment plan need to be reconciled by the vendor.");
  if (down > 15000000 || instalment > 15000000) throw new Error("This payment exceeds the supported M-Pesa limit.");
  return { down_payment_cents: down, instalment_cents: instalment, instalment_count: product.instalment_count, frequency: product.instalment_frequency, total_cents: total };
}

export function paygProgress(plan: { down_payment_cents: number; instalment_cents: number; instalment_count: number; total_cents: number }, attempts: { status: string; amount_cents: number }[]) {
  const paid = attempts.filter(a => a.status === "completed").reduce((sum, a) => sum + Number(a.amount_cents), 0);
  const remaining = Math.max(0, Number(plan.total_cents) - paid);
  return { paid_cents: paid, remaining_cents: remaining, instalments_paid: Math.min(plan.instalment_count, Math.floor(Math.max(0, paid - Number(plan.down_payment_cents)) / Number(plan.instalment_cents))), next_payment_cents: remaining === 0 ? 0 : paid < Number(plan.down_payment_cents) ? Number(plan.down_payment_cents) - paid : Math.min(Number(plan.instalment_cents), remaining), pending: attempts.some(a => ["initiated", "pending", "uncertain"].includes(a.status)) };
}

export const paygStartSchema = z.object({ product_id: z.string().uuid(), request_id: z.string().uuid(), phone: z.string().trim().regex(/^(?:254|0)?[17]\d{8}$/, "Enter a Kenyan M-Pesa phone number") });

export function matchingPaygCallback(attempt: { amount_cents: number; phone: string; checkout_request_id: string; merchant_request_id: string }, cb: { checkout: string; merchant: string; amount: unknown; phone: unknown; receipt: unknown }) {
  try {
    return cb.checkout === attempt.checkout_request_id && cb.merchant === attempt.merchant_request_id && paygCents(String(cb.amount)) === Number(attempt.amount_cents) && String(cb.phone) === attempt.phone && typeof cb.receipt === "string" && /^[A-Z0-9]{8,20}$/.test(cb.receipt);
  } catch { return false; }
}

export type PaygPlanView = {
  id: string; product_id: string; product_name: string; down_payment_cents: number; instalment_cents: number; instalment_count: number; frequency: string; total_cents: number;
  paid_cents: number; remaining_cents: number; instalments_paid: number; next_payment_cents: number; pending: boolean;
  payments: { id: string; amount_cents: number; status: string; receipt: string | null; error_message: string | null; created_at: string }[];
};