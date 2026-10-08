import { describe, expect, it } from "vitest";
import { summarize } from "@/lib/transaction-records.functions";

describe("transaction records summary", () => {
  it("totals amounts without float drift and counts statuses", () => {
    const s = summarize([
      { amount_paid: "100.10", commission_amount: "5.00", vat_on_commission_amount: "0.80", units: "3.4483", token_status: "generated", token_id: "a" },
      { amount_paid: "200.20", commission_amount: null, vat_on_commission_amount: null, units: null, token_status: "failed", token_id: null },
    ]);
    expect(s).toMatchObject({ total: 2, successful: 1, failed: 1, amount_paid: 300.3, commission: 5, vat: 0.8, units: 3.4483, tokens: 1 });
  });
});
