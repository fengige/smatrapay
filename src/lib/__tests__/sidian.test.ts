import { describe, expect, it } from "vitest";
import { checkSidianAuth, checkSidianPayload, isSidianPaymentConfirmed, parseSidianNarration, sidianPayload } from "../sidian.server";
import { deductCommission } from "../commission";

const cfg = { username: "sidian", password: "s3cret", shortcode: "111999" };
const basic = (u: string, p: string) => `Basic ${btoa(`${u}:${p}`)}`;
const sample = {
  ConfirmationRequest: {
    status: 0,
    data: { Reference: "REF1", Amount: "100.00", Date: "2026-08-31 16:30:00", BusinessShortCode: "111999", MSISDN: "254711111111", Names: "Test Customer", Account: "000053", Narration: "000053#14503254824" },
    TransactionType: "C2B_CONFIRMATION",
    TrasactionID: "TX1",
  },
};
const withData = (d: object) => ({ ConfirmationRequest: { ...sample.ConfirmationRequest, data: { ...sample.ConfirmationRequest.data, ...d } } });

describe("Sidian C2B notification", () => {
  it("parses the meter number from Narration, not Account", () => {
    const d = sidianPayload.parse(sample).ConfirmationRequest.data;
    expect(parseSidianNarration(d.Narration)).toEqual({ expressnumber: "000053", meternumber: "14503254824" });
    expect(d.Account).toBe("000053");
  });
  it("preserves leading zeros in express number and meter number", () => {
    expect(parseSidianNarration("000053#0012345678")).toEqual({ expressnumber: "000053", meternumber: "0012345678" });
  });
  it("rejects a missing narration", () => {
    expect(parseSidianNarration(null)).toBeNull();
    expect(parseSidianNarration(undefined)).toBeNull();
    expect(parseSidianNarration("")).toBeNull();
  });
  it("rejects a narration without the # delimiter", () => {
    expect(parseSidianNarration("00005314503254824")).toBeNull();
  });
  it("rejects an empty meter number", () => {
    expect(parseSidianNarration("000053#")).toBeNull();
    expect(parseSidianNarration("000053#  ")).toBeNull();
  });
  it("rejects an empty express number and extra delimiters", () => {
    expect(parseSidianNarration("#14503254824")).toBeNull();
    expect(parseSidianNarration("a#b#c")).toBeNull();
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
  it("accepts the Pay Bill transaction type", () => {
    const p = sidianPayload.parse({ ConfirmationRequest: { ...sample.ConfirmationRequest, TransactionType: "Pay Bill" } });
    expect(checkSidianPayload(p, cfg)).toBeNull();
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

import { matchSidianAuth } from "../sidian.server";
import { sidianInput } from "../payment-accounts.functions";
describe("vendor-specific Sidian settings", () => {
  const a = { username: "vendorA", password: "pa", shortcode: "111999" };
  const b = { username: "vendorB", password: "pb", shortcode: "222888" };
  it("Vendor A's credentials match Vendor A's settings", () => expect(matchSidianAuth(basic("vendorA", "pa"), [a])).toEqual(a));
  it("Vendor B's credentials are rejected for a Vendor A meter", () => expect(matchSidianAuth(basic("vendorB", "pb"), [a])).toBeNull());
  it("Vendor A's credentials with Vendor B's shortcode are rejected", () => {
    expect(checkSidianPayload(sidianPayload.parse(withData({ BusinessShortCode: "222888" })), a)).toBe("SHORTCODE_INVALID");
  });
  it("BusinessShortCode keeps leading zeros", () => {
    expect(sidianInput.parse({ endpoint: "https://x.co/n", username: "u", business_shortcode: "000123" }).business_shortcode).toBe("000123");
  });
  it("BusinessShortCode rejects letters", () => {
    expect(sidianInput.safeParse({ endpoint: "https://x.co/n", username: "u", business_shortcode: "12A4" }).success).toBe(false);
  });
});
