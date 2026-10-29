import { describe, it, expect } from "vitest";
import { paygSummarySchema, paygVendorIds, resolvePaygSummaries, DEFAULT_PAYG_SUMMARY } from "../payg-summary";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
describe("vendor summary isolation", () => {
  it("rejects a supplied vendor identity instead of trusting it", () => {
    expect(paygSummarySchema.safeParse({ vendor_id: b, summary_text: "Own summary" }).success).toBe(false);
  });
  it("rejects an empty customization", () => {
    expect(paygSummarySchema.safeParse({ summary_text: " \n " }).success).toBe(false);
  });
  it("matches each relevant vendor without leaking another vendor's customization", () => {
    const rows = [{ vendor_id: a, summary_text: "A instalment terms" }];
    expect(resolvePaygSummaries([a], rows, [])[0]?.summary_text).toBe("A instalment terms");
    expect(resolvePaygSummaries([b], rows, [])[0]?.summary_text).toBe(DEFAULT_PAYG_SUMMARY);
  });
  it("residents receive only assigned vendors even with extra summary rows", () => {
    const result = resolvePaygSummaries(paygVendorIds([{ vendor_id: a }, { vendor_id: a }, { vendor_id: null }]), [
      { vendor_id: a, summary_text: "A summary" }, { vendor_id: b, summary_text: "Private B summary" },
    ], [{ id: a, name: "Vendor A" }, { id: b, name: "Vendor B" }]);
    expect(result).toEqual([{ vendor_id: a, vendor_name: "Vendor A", summary_text: "A summary" }]);
  });
  it("keeps multiple relevant vendors separately attributed", () => {
    const result = resolvePaygSummaries([a,b], [{ vendor_id: a, summary_text: "A terms" }, { vendor_id: b, summary_text: "B terms" }], []);
    expect(result.map(r => [r.vendor_id, r.summary_text])).toEqual([[a, "A terms"], [b, "B terms"]]);
  });
});