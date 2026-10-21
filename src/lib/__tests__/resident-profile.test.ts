import { describe, expect, it } from "vitest";
import { auditFilters, imageMime, residentPersonalInput, residentSelfPassword, requiresSecondFactor, validOwnAvatar } from "../resident-profile";

describe("resident self profile rules", () => {
  const personal = { name: "Resident Name", username: "resident", phone: "+254700000000", address: "", id_number: "", bio: "" };
  it("rejects changes to protected roles", () => expect(residentPersonalInput.safeParse({ ...personal, role: "admin" }).success).toBe(false));
  it("rejects changes to sign-in email", () => expect(residentPersonalInput.safeParse({ ...personal, email: "other@example.com" }).success).toBe(false));
  it("normalizes permitted usernames", () => expect(residentPersonalInput.parse({ ...personal, username: " Resident.Name " }).username).toBe("resident.name"));
  it("requires matching passwords", () => expect(residentSelfPassword.safeParse({ current: "old", password: "simple", confirmation: "different" }).success).toBe(false));
  it("retains six-character relaxed resident policy", () => expect(residentSelfPassword.safeParse({ current: "old", password: "simple", confirmation: "simple" }).success).toBe(true));
  it("rejects shorter than six", () => expect(residentSelfPassword.safeParse({ current: "old", password: "short", confirmation: "short" }).success).toBe(false));
  it("requires current password", () => expect(residentSelfPassword.safeParse({ current: "", password: "simple", confirmation: "simple" }).success).toBe(false));
  it("rejects foreign photo folders", () => expect(validOwnAvatar("other/profile/photo.png", "self")).toBe(false));
  it("rejects path traversal", () => expect(validOwnAvatar("self/profile/../photo.png", "self")).toBe(false));
  it("recognizes PNG contents", () => expect(imageMime(new Uint8Array([137,80,78,71,13,10,26,10]))).toBe("image/png"));
  it("rejects executable/script contents", () => expect(imageMime(new TextEncoder().encode("<script>"))).toBe(null));
  it("enrollment alone is not enabled", () => expect(requiresSecondFactor(["resident"], [{ status: "unverified" }], "aal1")).toBe(false));
  it("verified factors require aal2", () => expect(requiresSecondFactor(["resident"], [{ status: "verified" }], "aal1")).toBe(true));
  it("verified aal2 grants continuation", () => expect(requiresSecondFactor(["resident"], [{ status: "verified" }], "aal2")).toBe(false));
  it("rejects reversed date range", () => expect(auditFilters.safeParse({ from: "2026-10-22", to: "2026-10-21" }).success).toBe(false));
});