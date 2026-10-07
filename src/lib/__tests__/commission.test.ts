import { describe, expect, it } from "vitest";
import { commissionInput, computeCommission } from "../prices.functions";

describe("commission settings", () => {
  it("accepts decimals like 2.5 and 16", () => {
    expect(commissionInput.safeParse({ commission_percentage: 2.5, vat_on_commission_percentage: 16 }).success).toBe(true);
  });
  it("rejects negative values", () => {
    expect(commissionInput.safeParse({ commission_percentage: -2, vat_on_commission_percentage: 16 }).success).toBe(false);
  });
  it("rejects values above 100%", () => {
    expect(commissionInput.safeParse({ commission_percentage: 150, vat_on_commission_percentage: 16 }).success).toBe(false);
  });
  it("5% commission with 16% VAT on KES 1000 is 50 + 8", () => {
    expect(computeCommission(1000, 5, 16)).toEqual({ commission: 50, vat_on_commission: 8, total: 58 });
  });
});
