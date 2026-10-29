import { describe, expect, it } from "vitest";
import { canApplyForPayg, canPayApprovedApplication, isVendorPaygConfig, paygApplicationSchema } from "../payg-approval";
describe("Pay-as-you-go approval gates", () => {
  it("hides unapproved products from applications", () => { expect(canApplyForPayg({ approval_status: "pending", is_active: true })).toBe(false); expect(canApplyForPayg({ approval_status: "approved", is_active: true })).toBe(true); });
  it("keeps deleted and withdrawn products unavailable", () => { expect(canApplyForPayg({ approval_status: "approved", is_active: false })).toBe(false); expect(canApplyForPayg({ approval_status: "approved", is_active: true, deleted_at: "2026-10-29" })).toBe(false); });
  it("requires approved resident applications before payments", () => { expect(canPayApprovedApplication("pending")).toBe(false); expect(canPayApprovedApplication("declined")).toBe(false); expect(canPayApprovedApplication(undefined)).toBe(false); expect(canPayApprovedApplication("approved")).toBe(true); });
  it("requires accepting terms and valid application details", () => {
    const input = { product_id: "11111111-1111-4111-8111-111111111111", full_name: "Resident Name", phone: "0722123456", delivery_address: "Nairobi, Unit 1", notes: "", accepted_terms: true };
    expect(paygApplicationSchema.safeParse(input).success).toBe(true);
    expect(paygApplicationSchema.safeParse({ ...input, accepted_terms: false }).success).toBe(false);
    expect(paygApplicationSchema.safeParse({ ...input, delivery_address: "" }).success).toBe(false);
  });
  it("routes only to a live vendor-owned account, never platform or another vendor", () => {
    const cfg = { owner_id: "vendor-a", enabled: true, stk_enabled: true, country: "KE", currency: "KES", environment: "production" };
    expect(isVendorPaygConfig(cfg, "vendor-a")).toBe(true);
    expect(isVendorPaygConfig({ ...cfg, owner_id: null }, "vendor-a")).toBe(false);
    expect(isVendorPaygConfig(cfg, "vendor-b")).toBe(false);
    expect(isVendorPaygConfig({ ...cfg, environment: "sandbox" }, "vendor-a")).toBe(false);
  });
});