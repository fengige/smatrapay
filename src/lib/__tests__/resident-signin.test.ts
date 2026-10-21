import { describe, expect, it } from "vitest";
import { oauthErrorMessage, residentDecision, safeResidentReturn } from "../resident-signin";

describe("safeResidentReturn", () => {
  it("defaults to the resident dashboard", () => {
    expect(safeResidentReturn(null)).toBe("/resident/dashboard");
  });
  it("keeps a resident portal path", () => {
    expect(safeResidentReturn("/resident/jobs")).toBe("/resident/jobs");
  });
  it("rejects external URLs", () => {
    expect(safeResidentReturn("https://evil.com/resident/jobs")).toBe("/resident/dashboard");
    expect(safeResidentReturn("//evil.com")).toBe("/resident/dashboard");
  });
  it("rejects other portals", () => {
    expect(safeResidentReturn("/admin/dashboard")).toBe("/resident/dashboard");
  });
});

describe("residentDecision", () => {
  const active = { status: "active" };
  it("allows an active resident", () => {
    expect(residentDecision({ roles: ["resident"], profile: active }).ok).toBe(true);
  });
  it("denies without a profile", () => {
    expect(residentDecision({ roles: ["resident"], profile: null })).toMatchObject({ reason: "no_profile" });
  });
  it("denies suspended residents", () => {
    expect(residentDecision({ roles: ["resident"], profile: { status: "suspended" } })).toMatchObject({ reason: "inactive" });
  });
  it("denies accounts without the resident role", () => {
    expect(residentDecision({ roles: [], profile: active })).toMatchObject({ reason: "not_resident" });
  });
  it("sends staff accounts to the staff tab", () => {
    expect(residentDecision({ roles: ["resident", "vendor"], profile: active })).toMatchObject({ reason: "staff" });
  });
});

describe("oauthErrorMessage", () => {
  it("detects cancellation", () => {
    expect(oauthErrorMessage("access_denied", null)).toMatch(/cancelled/);
  });
  it("is null without an error", () => {
    expect(oauthErrorMessage(null, null)).toBeNull();
  });
});
