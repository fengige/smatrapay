import { describe, expect, it } from "vitest";
import { checkNcbaAuth, ncbaPayload, parseNcbaAmount } from "../ncba.server";
import { deductCommission } from "../commission";

const cfg = { username: "u", password: "p", hash: "h", shortcode: "880100" };
const base = { TransType: "Pay Bill", TransID: "UI4AN5SQ7O", TransTime: "2026-09-04 00:29:13", TransAmount: "5000.00", BusinessShortCode: "880100", BillRefNumber: "2246199#MHA401", Narrative: "MHA401", Mobile: "", name: " ", Username: "u", Password: "p", Hash: "h" };

describe("NCBA notification", () => {
  it("TransAmount 5000.00 is KES 5000", () => expect(parseNcbaAmount("5000.00")).toBe(5000));
  it("rejects zero, negative and malformed amounts", () => {
    expect(parseNcbaAmount("0.00")).toBeNull();
    expect(parseNcbaAmount("-5")).toBeNull();
    expect(parseNcbaAmount("5,000")).toBeNull();
  });
  it("Narrative, not BillRefNumber, is the meter number", () => {
    expect(ncbaPayload.parse(base).Narrative).toBe("MHA401");
  });
  it("accepts correct credentials", () => expect(checkNcbaAuth(ncbaPayload.parse(base), cfg)).toBeNull());
  it("rejects a wrong password", () => expect(checkNcbaAuth(ncbaPayload.parse({ ...base, Password: "x" }), cfg)).toBe("AUTH_FAILED"));
  it("rejects a wrong hash", () => expect(checkNcbaAuth(ncbaPayload.parse({ ...base, Hash: "x" }), cfg)).toBe("HASH_INVALID"));
  it("rejects another shortcode", () => expect(checkNcbaAuth(ncbaPayload.parse({ ...base, BusinessShortCode: "111" }), cfg)).toBe("SHORTCODE_INVALID"));
  it("KES 5000 at 5% + 16% VAT on commission tokenizes KES 4710", () => {
    const b = deductCommission(5000, 5, 16);
    expect([b.commission_amount, b.vat_on_commission_amount, b.net_amount]).toEqual([250, 40, 4710]);
  });
});

import { nextQueueState } from "../ncba.server";
describe("NCBA retry queue", () => {
  const now = Date.parse("2026-10-07T10:00:00Z");
  it("first vending rejection retries in 1 minute", () => {
    expect(nextQueueState("failed", 0, now)).toEqual({ status: "retry_pending", next_retry_at: "2026-10-07T10:01:00.000Z" });
  });
  it("a timeout is never auto-retried", () => expect(nextQueueState("review", 0, now).status).toBe("needs_review"));
  it("after 5 automatic retries it stops and waits for an admin", () => expect(nextQueueState("failed", 5, now).status).toBe("failed"));
});
