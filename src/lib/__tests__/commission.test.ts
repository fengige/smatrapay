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

import { effectiveCommissionRates, meterCommissionInput } from "../prices.functions";
describe("per-meter commission", () => {
  const defaults = { commission_percentage: 5, vat_on_commission_percentage: 16 };
  it("meter's own values win over defaults", () => {
    expect(effectiveCommissionRates({ commission_percentage: 3, vat_on_commission_percentage: null }, defaults)).toEqual({ commission_percentage: 3, vat_on_commission_percentage: 16 });
  });
  it("rejects 150% for selected meters", () => {
    expect(meterCommissionInput.safeParse({ ids: ["6aa6a012-4f08-41b6-b1f4-df0a2dc11ae9"], commission_percentage: 150 }).success).toBe(false);
  });
});

import { deductCommission, grossUpForUnits } from "../commission";
describe("commission deducted before token generation", () => {
  it("KES 1000 at 5% + 16% VAT tokenizes KES 942", () => {
    const b = deductCommission(1000, 5, 16);
    expect([b.commission_amount, b.vat_on_commission_amount, b.net_amount]).toEqual([50, 8, 942]);
  });
  it("0% commission leaves the payment untouched", () => {
    expect(deductCommission(150, 0, 16).net_amount).toBe(150);
  });
  it("buying units grosses up the payment so the token value is exact", () => {
    const b = grossUpForUnits(942, 5, 16);
    expect(b.net_amount).toBe(942);
    expect(b.gross_amount).toBe(1000);
  });
});
