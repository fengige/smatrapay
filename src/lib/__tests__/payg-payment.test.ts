import { describe, it, expect, vi } from "vitest";
import { paygCents, paygTerms, paygProgress, matchingPaygCallback, paygStartSchema } from "../payg-payment";
import { verifyPaygPayment } from "../payg-payment.server";
import { darajaPost, getDarajaToken } from "../mpesa.server";

vi.mock("../mpesa.server", () => ({ getDarajaToken: vi.fn(), darajaPost: vi.fn(), darajaTimestamp: () => "20261027205500", stkPassword: () => "test-password" }));
const product = { down_payment: "2800.00", instalment_amount: "65.00", instalment_count: 480, instalment_frequency: "daily", price: null };
const plan = paygTerms(product);
const a = { amount_cents: 280000, phone: "254722123456", checkout_request_id: "checkout", merchant_request_id: "merchant" };
const callback = { checkout: "checkout", merchant: "merchant", amount: 2800, phone: 254722123456, receipt: "ABC1234567" };

describe("Pay-as-you-go plan rules", () => {
  it("snapshots the supplied HomePlus Max down payment", () => expect(plan.down_payment_cents).toBe(280000));
  it("snapshots KES 65 daily for exactly 480 payments", () => { expect(plan.instalment_cents).toBe(6500); expect(plan.instalment_count).toBe(480); expect(plan.frequency).toBe("daily"); });
  it("derives the total from the confirmed schedule", () => expect(plan.total_cents).toBe(3400000));
  it("preserves exact decimal money", () => expect(paygCents("12.39")).toBe(1239));
  it("rejects inconsistent product prices", () => expect(() => paygTerms({ ...product, price: 33000 })).toThrow());
  it("never rounds fractional plan payments for M-Pesa", () => expect(() => paygTerms({ ...product, instalment_amount: "65.01" })).toThrow());
  it("requires a complete payment plan", () => expect(() => paygTerms({ ...product, instalment_count: null })).toThrow());
  it("rejects schedules outside the existing product count limit", () => expect(() => paygTerms({ ...product, instalment_count: 1001 })).toThrow());
  it("starts with the down payment", () => expect(paygProgress(plan, []).next_payment_cents).toBe(280000));
  it("switches to KES 65 only after the confirmed down payment", () => expect(paygProgress(plan, [{ amount_cents: 280000, status: "completed" }]).next_payment_cents).toBe(6500));
  it("ignores pending and failed payments in progress", () => { const p = paygProgress(plan, [{ amount_cents: 280000, status: "pending" }, { amount_cents: 6500, status: "failed" }]); expect(p.paid_cents).toBe(0); expect(p.pending).toBe(true); });
  it("locks new charges during uncertain requests", () => expect(paygProgress(plan, [{ amount_cents: 280000, status: "uncertain" }]).pending).toBe(true));
  it("counts only confirmed instalments after the down payment", () => expect(paygProgress(plan, [{ amount_cents: 280000, status: "completed" }, { amount_cents: 6500, status: "completed" }]).instalments_paid).toBe(1));
  it("stops charging at full repayment", () => { const p = paygProgress(plan, [{ amount_cents: 3400000, status: "completed" }]); expect(p.remaining_cents).toBe(0); expect(p.next_payment_cents).toBe(0); expect(p.instalments_paid).toBe(480); });
  it("checks checkout, merchant, amount, phone and receipt", () => { expect(matchingPaygCallback(a, callback)).toBe(true); for (const bad of [{ checkout: "other" }, { merchant: "other" }, { amount: 65 }, { phone: "254722000000" }, { receipt: "" }]) expect(matchingPaygCallback(a, { ...callback, ...bad })).toBe(false); });
  it("does not accept client-controlled amounts", () => { const input = paygStartSchema.parse({ product_id: "39502712-41e3-4083-a2ee-8734b6e861c7", request_id: "39502712-41e3-4083-a2ee-8734b6e861c8", phone: "0722123456", amount: 1 }); expect(input).not.toHaveProperty("amount"); });
});

function dbMock() {
  const chain: any = { select: vi.fn(() => chain), eq: vi.fn(() => chain), maybeSingle: vi.fn(async () => ({ data: { consumer_key: "test", consumer_secret: "test", passkey: "test", environment: "sandbox", business_short_code: "test" } })), insert: vi.fn(async () => ({ error: null })) };
  return { from: vi.fn(() => chain), rpc: vi.fn(async () => ({ data: true, error: null })) };
}
describe("Provider-verified Pay-as-you-go confirmation", () => {
  it("ignores a claimed callback success while Daraja says pending", async () => {
    const db = dbMock(); vi.mocked(getDarajaToken).mockResolvedValue("test"); vi.mocked(darajaPost).mockResolvedValue({ ok: true, status: 200, body: { errorCode: "pending" } });
    await verifyPaygPayment(db, { ...a, id: "attempt", status: "pending", config_id: "cfg" }, callback); expect(db.rpc).not.toHaveBeenCalled();
  });
  it("does not credit a mismatched amount even when Daraja says successful", async () => {
    const db = dbMock(); vi.mocked(darajaPost).mockResolvedValue({ ok: true, status: 200, body: { ResponseCode: "0", ResultCode: 0 } });
    await expect(verifyPaygPayment(db, { ...a, id: "attempt", status: "pending" }, { ...callback, amount: 1 })).rejects.toThrow(); expect(db.rpc).not.toHaveBeenCalled();
  });
  it("calls atomic confirmation only after provider success", async () => {
    const db = dbMock(); vi.mocked(darajaPost).mockResolvedValue({ ok: true, status: 200, body: { ResponseCode: "0", ResultCode: 0 } });
    await verifyPaygPayment(db, { ...a, id: "attempt", status: "pending" }, callback); expect(db.rpc).toHaveBeenCalledWith("confirm_payg_payment", { p_attempt: "attempt", p_success: true, p_receipt: "ABC1234567", p_message: null });
  });
  it("does not repeat confirmation on duplicate completed callbacks", async () => { const db = dbMock(); await verifyPaygPayment(db, { ...a, id: "attempt", status: "completed", receipt: "ABC1234567" }, callback); expect(db.rpc).not.toHaveBeenCalled(); });
  it("allows a verified late callback to fill a receipt after status-query confirmation", async () => {
    const db = dbMock(); vi.mocked(darajaPost).mockResolvedValue({ ok: true, status: 200, body: { ResponseCode: "0", ResultCode: 0 } });
    await verifyPaygPayment(db, { ...a, id: "attempt", status: "completed", receipt: null }, callback); expect(db.rpc).toHaveBeenCalledWith("confirm_payg_payment", expect.objectContaining({ p_receipt: "ABC1234567" }));
  });
  it("records a provider-confirmed failure without credit", async () => {
    const db = dbMock(); vi.mocked(darajaPost).mockResolvedValue({ ok: true, status: 200, body: { ResponseCode: "0", ResultCode: 1032 } });
    await verifyPaygPayment(db, { ...a, id: "attempt", status: "pending" }); expect(db.rpc).toHaveBeenCalledWith("confirm_payg_payment", expect.objectContaining({ p_success: false, p_receipt: null }));
  });
  it("does not release a charge lock for an unknown nonzero provider outcome", async () => {
    const db = dbMock(); vi.mocked(darajaPost).mockResolvedValue({ ok: true, status: 200, body: { ResponseCode: "0", ResultCode: 9999 } });
    await verifyPaygPayment(db, { ...a, id: "attempt", status: "pending" }); expect(db.rpc).not.toHaveBeenCalled();
  });
});