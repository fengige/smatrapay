import { describe, expect, it } from "vitest";
import { canCorrectBankPayment, meterCorrectionSchema } from "../bank-payment-retry";

describe("bank meter correction", () => {
  it("permits safe failed and queued payments", () => {
    for (const status of ["failed", "retry_pending"]) expect(canCorrectBankPayment({ status, bank: "NCBA" })).toBe(true);
  });
  it("blocks completed, processing and uncertain payments", () => {
    for (const status of ["completed", "processing", "needs_review"]) expect(canCorrectBankPayment({ status, bank: "NCBA" })).toBe(false);
  });
  it("requires confirmed Sidian payment", () => {
    expect(canCorrectBankPayment({ status: "rejected", bank: "SIDIAN", payment_status: "0" })).toBe(true);
    expect(canCorrectBankPayment({ status: "failed", bank: "SIDIAN", payment_status: "1" })).toBe(false);
  });
  it("preserves leading zero meter identifiers", () => {
    expect(meterCorrectionSchema.parse({ meter_number: " 000053 ", correction_reason: "Customer correction", expected_updated_at: "2026-11-05T09:36:00Z" }).meter_number).toBe("000053");
  });
  it("requires meter, reason and a valid concurrency timestamp", () => {
    for (const field of ["meter_number", "correction_reason", "expected_updated_at"]) {
      expect(meterCorrectionSchema.safeParse({ meter_number: "000053", correction_reason: "Customer correction", expected_updated_at: "2026-11-05T09:36:00Z", [field]: "" }).success).toBe(false);
    }
  });
});