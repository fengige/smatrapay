import { z } from "zod";

export const meterCorrectionSchema = z.object({
  meter_number: z.string().trim().min(1, "Enter a meter number").max(64),
  correction_reason: z.string().trim().min(1, "Enter a correction reason").max(500),
  expected_updated_at: z.string().datetime({ offset: true }),
});

export function canCorrectBankPayment(row: { status: string; bank: string | null; payment_status?: string | null }) {
  return ["failed", "retry_pending", "rejected"].includes(row.status)
    && (row.bank !== "SIDIAN" || row.payment_status === "0");
}