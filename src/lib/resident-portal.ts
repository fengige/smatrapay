/** Shared, browser-safe rules for the Resident Portal. */

export type PurchaseStatus =
  | "initiated"
  | "pending_payment"
  | "payment_failed"
  | "paid"
  | "vending"
  | "vended"
  | "vend_failed";

export const PURCHASE_MIN = 10;
export const PURCHASE_MAX = 150_000;

export const PURCHASE_LABEL: Record<PurchaseStatus, string> = {
  initiated: "Starting",
  pending_payment: "Waiting for M-Pesa",
  payment_failed: "Payment failed",
  paid: "Paid — issuing token",
  vending: "Issuing token",
  vended: "Token issued",
  vend_failed: "Paid — token pending",
};

/** A token is only ever shown once vending actually succeeded. */
export const tokenVisible = (s: string) => s === "vended";

/** Retrying vending never charges again: only paid purchases whose vend failed qualify. */
export const canRetryVend = (s: string) => s === "vend_failed";

/** Money actually received from the resident. */
export const isPaid = (s: string) => ["paid", "vending", "vended", "vend_failed"].includes(s);

export function validatePurchaseAmount(amount: number): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return "Enter an amount greater than zero.";
  if (amount < PURCHASE_MIN) return `The minimum purchase is KES ${PURCHASE_MIN}.`;
  if (amount > PURCHASE_MAX) return `The maximum purchase is KES ${PURCHASE_MAX.toLocaleString()}.`;
  if (Math.round(amount) !== amount) return "M-Pesa only accepts whole shillings.";
  return null;
}

export type StatementLine = {
  date: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
};

/**
 * Token statement: each confirmed payment is a credit, and the token it bought is the matching
 * debit (gross value incl. commission/VAT). A paid purchase still awaiting its token leaves a credit.
 */
export function buildTokenStatement(
  rows: { created_at: string; reference: string; meter_number: string; amount: number; status: string }[],
): { lines: StatementLine[]; closing: number } {
  const lines: StatementLine[] = [];
  let bal = 0;
  const sorted = [...rows].filter((r) => isPaid(r.status)).sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const r of sorted) {
    bal = Math.round((bal + r.amount) * 100) / 100;
    lines.push({ date: r.created_at, reference: r.reference, description: `M-Pesa payment — meter ${r.meter_number}`, debit: 0, credit: r.amount, balance: bal });
    if (r.status === "vended") {
      bal = Math.round((bal - r.amount) * 100) / 100;
      lines.push({ date: r.created_at, reference: r.reference, description: `Token purchase — meter ${r.meter_number}`, debit: r.amount, credit: 0, balance: bal });
    }
  }
  return { lines, closing: bal };
}

export const FEEDBACK_CATEGORIES = [
  "Maintenance service",
  "Service provider performance",
  "Portal experience",
  "Payment experience",
  "General feedback",
] as const;
