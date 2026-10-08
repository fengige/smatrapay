import { describe, expect, it } from "vitest";
import { summarizeVendors } from "../admin-dashboard";

describe("dashboard vendor metrics", () => {
  const profiles = [
    { id: "vendor-active", status: "active", created_at: "2026-01-01" },
    { id: "vendor-inactive", status: "inactive", created_at: "2026-01-02" },
    ...Array.from({ length: 8 }, (_, i) => ({ id: `resident-${i}`, status: "active", created_at: "2026-02-01" })),
  ];
  const roles = [
    { user_id: "vendor-active", role: "vendor" },
    { user_id: "vendor-active", role: "admin" },
    { user_id: "vendor-inactive", role: "vendor" },
  ];
  it("counts active vendors rather than all active accounts", () => {
    expect(summarizeVendors(profiles, roles)).toMatchObject({ total: 2, active: 1 });
  });
  it("selects recent vendors before limiting results", () => {
    expect(summarizeVendors(profiles, roles).recent.map((row) => row.id)).toEqual(["vendor-inactive", "vendor-active"]);
  });
});