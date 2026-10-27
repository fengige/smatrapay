import { describe, it, expect } from "vitest";
import { ownsPaygImage, paygProductSchema } from "../payg";
const base = { name: "Sun King Home 60", description: null, image_path: null, price: 10000, down_payment: 1000, instalment_amount: 50, instalment_frequency: "daily" as const, instalment_count: 180, is_active: true };
describe("payg product rules", () => {
  it("accepts a valid product", () => expect(paygProductSchema.safeParse(base).success).toBe(true));
  it("requires a name", () => expect(paygProductSchema.safeParse({ ...base, name: "  " }).success).toBe(false));
  it("rejects negative price", () => expect(paygProductSchema.safeParse({ ...base, price: -1 }).success).toBe(false));
  it("rejects down payment above price", () => expect(paygProductSchema.safeParse({ ...base, down_payment: 20000 }).success).toBe(false));
  it("needs frequency with instalment", () => expect(paygProductSchema.safeParse({ ...base, instalment_frequency: null }).success).toBe(false));
  it("limits images to vendor folder", () => {
    expect(ownsPaygImage("v1", "v1/a.png")).toBe(true);
    expect(ownsPaygImage("v1", "v2/a.png")).toBe(false);
  });
});
