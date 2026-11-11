import { describe, expect, it } from "vitest";
import { navGroupsForRoles } from "../portal-nav";
import { supplierPageRedirect } from "../portals";

describe("supplier portal visibility", () => {
  it("redirects vendors away from shared supplier pages", () => {
    expect(supplierPageRedirect(["vendor"])).toBe("/vendor/dashboard");
  });
  it("redirects landlords away from shared supplier pages", () => {
    expect(supplierPageRedirect(["landlord"])).toBe("/landlord/dashboard");
  });
  it("retains administrator supplier access even with additional roles", () => {
    expect(supplierPageRedirect(["admin", "vendor", "landlord"])).toBeNull();
    expect(navGroupsForRoles(["admin"]).flatMap(g => g.items).some(i => i.to === "/meter-suppliers")).toBe(true);
  });
  it.each([["vendor"], ["landlord"], ["vendor", "landlord"]])("offers no supplier navigation for %j", (...roles) => {
    expect(navGroupsForRoles(roles).flatMap(g => g.items).some(i => i.to?.includes("meter-suppliers"))).toBe(false);
  });
});