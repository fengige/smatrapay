import { describe, expect, it } from "vitest";
import { formatUnits, truncateUnits, unitsFromAmount } from "@/lib/token-units";
import { iconUnits } from "@/lib/vending/icon.server";

describe("token units truncate to one decimal", () => {
  it("12.39 -> 12.3", () => expect(truncateUnits(12.39)).toBe(12.3));
  it("12.30 -> 12.3", () => expect(truncateUnits("12.30")).toBe(12.3));
  it("0.09 -> 0.0", () => expect(formatUnits(0.09)).toBe("0.0"));
  it("never rounds up 12.99", () => expect(truncateUnits(12.99)).toBe(12.9));
  it("whole numbers show one decimal", () => expect(formatUnits(5)).toBe("5.0"));
  it("ignores float noise", () => expect(truncateUnits(0.1 + 0.2)).toBe(0.3));
  it("tiny exponent values", () => expect(truncateUnits(1e-7)).toBe(0));
  it("amount/price without float error: 0.3 / 0.1 = 3.0", () => expect(unitsFromAmount(0.3, 0.1)).toBe(3));
  it("1000 KES at 23.5 = 42.5 (42.553…)", () => expect(unitsFromAmount(1000, 23.5)).toBe(42.5));
  it("100 KES at 30 = 3.3 (3.333…)", () => expect(unitsFromAmount(100, 30)).toBe(3.3));
  it("zero price gives zero units", () => expect(unitsFromAmount(100, 0)).toBe(0));
  it("Icon-Token units are truncated", () => expect(iconUnits(123.9, 10)).toBe(12.3));
});
