import { describe, expect, it } from "vitest";
import { calculateTokenCommission, deductCommission, grossUpForUnits } from "../commission";
import { commissionInput } from "../prices.functions";
import { unitsFromAmount } from "../token-units";

describe("authoritative commission payer rules", () => {
  it("Resident preserves KES 1000 less 50 commission and 8 VAT = 942", () => {
    expect(calculateTokenCommission(1000, 5, 16, "resident")).toEqual({ ...deductCommission(1000, 5, 16), commission_payer: "resident" });
    expect(calculateTokenCommission(1000, 5, 16, "resident").net_amount).toBe(942);
  });
  it("Owner preserves full KES 1000 while separately owing 50 + 8", () => {
    const b = calculateTokenCommission(1000, 5, 16, "owner");
    expect([b.gross_amount, b.net_amount, b.commission_amount, b.vat_on_commission_amount]).toEqual([1000, 1000, 50, 8]);
  });
  it.each([10, 170, 25])("Owner units equal full-payment purchase at tariff %s for all meter utilities", price => {
    const b = calculateTokenCommission(1000, 5, 16, "owner");
    expect(unitsFromAmount(b.net_amount, price)).toBe(unitsFromAmount(1000, price));
    expect(unitsFromAmount(b.net_amount, price)).toBeGreaterThan(unitsFromAmount(942, price));
  });
  it("Resident by-units retains original gross-up and rounding", () => {
    expect(calculateTokenCommission(942, 5, 16, "resident", true)).toEqual({ ...grossUpForUnits(942, 5, 16), commission_payer: "resident" });
    expect(calculateTokenCommission(942, 5, 16, "resident", true).gross_amount).toBe(1000);
  });
  it("Owner by-units does not gross up the resident payment", () => {
    expect(calculateTokenCommission(942, 5, 16, "owner", true).gross_amount).toBe(942);
    expect(calculateTokenCommission(942, 5, 16, "owner", true).net_amount).toBe(942);
  });
  it("requires a valid payer", () => {
    expect(commissionInput.safeParse({ commission_percentage: 5, vat_on_commission_percentage: 16 }).success).toBe(false);
    expect(commissionInput.safeParse({ commission_payer: "other", commission_percentage: 5, vat_on_commission_percentage: 16 }).success).toBe(false);
  });
  it.each([-1, 101, NaN, Infinity])("rejects invalid commission percentage %s", pct => {
    expect(() => calculateTokenCommission(1000, pct, 16, "owner")).toThrow();
  });
  it.each([-1, 101, NaN, Infinity])("rejects invalid VAT percentage %s", pct => {
    expect(() => calculateTokenCommission(1000, 5, pct, "resident")).toThrow();
  });
});