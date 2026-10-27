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
  it("labels the admin jobs route Jobs Management", () => {
    const items = navGroupsForRoles(["admin"]).flatMap((group) => group.items);
    const jobs = items.find((item) => item.to === "/jobs");
    expect(jobs?.label).toBe("Jobs Management");
    expect(adminLabels).not.toContain("Jobs");
  });
});

describe("resident sidebar", () => {
  it("lists Insurance, Loans, Sacco and Pay-as-you-go under Financial Services", () => {
    const group = navGroupsForRoles(["resident"]).find((g) => g.heading === "FINANCIAL SERVICES");
    expect(group?.items.map((i) => i.label)).toEqual(["Insurance", "Loans", "Sacco", "Pay-as-you-go"]);
    expect(group?.items.map((i) => i.to)).toEqual(["/resident/insurance", "/resident/loans", "/resident/sacco", "/resident/pay-as-you-go"]);
  });
});
