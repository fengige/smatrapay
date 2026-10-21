import { describe, expect, it } from "vitest";
import { buildTokenStatement, canRetryVend, tokenVisible, validatePurchaseAmount } from "../resident-portal";

describe("resident token purchases", () => {
  it("shows a token only after vending succeeded", () => {
    expect(tokenVisible("vended")).toBe(true);
    for (const s of ["pending_payment", "paid", "vend_failed", "payment_failed"]) expect(tokenVisible(s)).toBe(false);
  });
  it("allows retry only for paid purchases whose token failed, never unpaid ones", () => {
    expect(canRetryVend("vend_failed")).toBe(true);
    for (const s of ["pending_payment", "payment_failed", "vended", "initiated"]) expect(canRetryVend(s)).toBe(false);
  });
  it("rejects non-positive, fractional and out-of-range amounts", () => {
    expect(validatePurchaseAmount(0)).not.toBeNull();
    expect(validatePurchaseAmount(5)).not.toBeNull();
    expect(validatePurchaseAmount(100.5)).not.toBeNull();
    expect(validatePurchaseAmount(200_000)).not.toBeNull();
    expect(validatePurchaseAmount(100)).toBeNull();
  });
  it("statement counts only confirmed payments, and a pending token leaves a credit", () => {
    const st = buildTokenStatement([
      { created_at: "2026-10-01T10:00:00Z", reference: "A", meter_number: "1", amount: 100, status: "vended" },
      { created_at: "2026-10-02T10:00:00Z", reference: "B", meter_number: "1", amount: 50, status: "payment_failed" },
      { created_at: "2026-10-03T10:00:00Z", reference: "C", meter_number: "1", amount: 200, status: "vend_failed" },
    ]);
    expect(st.lines).toHaveLength(3);
    expect(st.closing).toBe(200);
  });
});
