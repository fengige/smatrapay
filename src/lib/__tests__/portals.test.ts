import { describe, expect, it } from "vitest";
import { PORTALS, dashboardForRoles, visiblePortals } from "../portals";

describe("staff sign-in portal list", () => {
  it("does not offer the Agent portal", () => {
    expect(visiblePortals().map((p) => p.id)).not.toContain("agent");
  });
  it("still offers every other portal", () => {
    expect(visiblePortals().map((p) => p.id)).toEqual([
      "admin",
      "landlord",
      "vendor",
      "service-provider",
    ]);
  });
  it("keeps the Agent role fully supported behind the scenes", () => {
    expect(PORTALS.some((p) => p.id === "agent")).toBe(true);
    expect(dashboardForRoles(["agent"])).toBe("/agent/dashboard");
  });
});
