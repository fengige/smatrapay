import { describe, expect, it } from "vitest";
import { hasRecoveryIntent, normalizeUsername, residentCredentials, residentUsername, trustedRecoveryUrl, verifiedRecoveryClaims } from "../resident-password";
import { residentDecision } from "../resident-signin";
import { createUserSchema, residentCreateSchema } from "../user-schema";

describe("resident credentials", () => {
  it("requires verified recovery authentication rather than a normal password session", () => {
    expect(verifiedRecoveryClaims({ amr: [{ method: "password" }] })).toBe(false);
    expect(verifiedRecoveryClaims({ amr: [{ method: "oauth" }] })).toBe(false);
    expect(verifiedRecoveryClaims({ amr: [{ method: "otp" }] })).toBe(true);
    expect(verifiedRecoveryClaims({})).toBe(false);
  });
  it("only sends recovery links to trusted app origins", () => {
    expect(trustedRecoveryUrl("https://evil.example")).toBe("https://apps.smatrapay.com/reset-password?type=recovery");
    expect(trustedRecoveryUrl("http://localhost:8080")).toBe("http://localhost:8080/reset-password?type=recovery");
  });
  it("normalizes usernames case-insensitively", () => {
    expect(normalizeUsername("  Felix.Ngige_1  ")).toBe("felix.ngige_1");
    expect(residentUsername.parse("  Felix.Ngige_1  ")).toBe("felix.ngige_1");
  });
  it("requires username and password and rejects lookup wildcards", () => {
    expect(residentCredentials.safeParse({ username: "", password: "x" }).success).toBe(false);
    expect(residentCredentials.safeParse({ username: "resident", password: "" }).success).toBe(false);
    expect(residentUsername.safeParse("%").success).toBe(false);
  });
  it("rejects pending, unlinked, and suspended accounts", () => {
    for (const status of ["pending", "suspended", "inactive", null]) expect(residentDecision({ roles: ["resident"], profile: { status } }).ok).toBe(false);
    expect(residentDecision({ roles: ["resident"], profile: null }).ok).toBe(false);
  });
  it("does not accept an ordinary signed-in session as a recovery link", () => {
    expect(hasRecoveryIntent("", "")).toBe(false);
    expect(hasRecoveryIntent("#type=signup", "")).toBe(false);
    expect(hasRecoveryIntent("#access_token=redacted&type=recovery", "")).toBe(true);
    expect(hasRecoveryIntent("", "?type=recovery")).toBe(true);
  });
  it("resident setup needs no staff-entered password, but staff creation still does", () => {
    const data = { name: "Existing Resident", email: "resident@example.com", role: "resident", password: "" };
    expect(residentCreateSchema.safeParse(data).success).toBe(true);
    expect(createUserSchema.safeParse({ ...data, role: "admin" }).success).toBe(false);
  });
});