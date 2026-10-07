import { describe, expect, it } from "vitest";
import { checkSidianAuth, checkSidianPayload, isSidianPaymentConfirmed, sidianPayload } from "../sidian.server";
import { deductCommission } from "../commission";

const cfg = { username: "sidian", password: "s3cret", shortcode: "111999" };
const basic = (u: string, p: string) => `Basic ${btoa(`${u}:${p}`)}`;
const sample = {
  ConfirmationRequest: {
    status: 0,
    data: { Reference: "REF1", Amount: "100.00", Date: "2026-08-31 16:30:00", BusinessShortCode: "111999", MSISDN: "254711111111", Names: "Test Customer", Account: "001234567890", Narration: "test" },
    TransactionType: "C2B_CONFIRMATION",
    TrasactionID: "TX1",
  },
};
const withData = (d: object) => ({ ConfirmationRequest: { ...sample.ConfirmationRequest, data: { ...sample.ConfirmationRequest.data, ...d } } });

describe("Sidian C2B notification", () => {
  it("Account, not Reference or MSISDN, is the meter number", () => {
    expect(sidianPayload.parse(sample).ConfirmationRequest.data.Account).toBe("001234567890");
  });
  it("accepts the correct username and password", () => expect(checkSidianAuth(basic("sidian", "s3cret"), cfg)).toBe(true));
  it("rejects a wrong password", () => expect(checkSidianAuth(basic("sidian", "x"), cfg)).toBe(false));
  it("rejects a missing Authorization header", () => expect(checkSidianAuth(null, cfg)).toBe(false));
  it("rejects a missing ConfirmationRequest", () => expect(sidianPayload.safeParse({}).success).toBe(false));
  it("rejects a missing Account", () => expect(sidianPayload.safeParse(withData({ Account: "" })).success).toBe(false));
  it("accepts shortcode 111999", () => expect(checkSidianPayload(sidianPayload.parse(sample), cfg)).toBeNull());
  it("rejects another shortcode", () => expect(checkSidianPayload(sidianPayload.parse(withData({ BusinessShortCode: "123456" })), cfg)).toBe("SHORTCODE_INVALID"));
  it("rejects zero amount", () => expect(checkSidianPayload(sidianPayload.parse(withData({ Amount: "0.00" })), cfg)).toBe("AMOUNT_INVALID"));
  it("rejects other transaction types", () => {
    const p = sidianPayload.parse({ ConfirmationRequest: { ...sample.ConfirmationRequest, TransactionType: "C2B_VALIDATION" } });
    expect(checkSidianPayload(p, cfg)).toBe("TRANS_TYPE_UNSUPPORTED");
  });
  it("only status 0 issues a token", () => {
    expect(isSidianPaymentConfirmed(0)).toBe(true);
    expect(isSidianPaymentConfirmed(1)).toBe(false);
  });
  it("KES 100 at 5% + 16% VAT on commission tokenizes KES 94.20", () => {
    const b = deductCommission(100, 5, 16);
    expect([b.commission_amount, b.vat_on_commission_amount, b.net_amount]).toEqual([5, 0.8, 94.2]);
  });
});
