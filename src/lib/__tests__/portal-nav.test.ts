import { describe, expect, it } from "vitest";
import { navGroupsForRoles } from "../portal-nav";

const adminLabels = navGroupsForRoles(["admin"]).flatMap((group) =>
  group.items.map((item) => item.label),
);

describe("admin sidebar", () => {
  it("does not show Agent Management", () => {
    expect(adminLabels).not.toContain("Agent Management");
  });
  it("still shows the other management modules", () => {
    for (const label of [
      "Resident Management",
      "Landlord Management",
      "Property Management",
      "Vendor Management",
      "Service Provider",
      "User Management",
    ]) {
      expect(adminLabels).toContain(label);
    }
  });
});
