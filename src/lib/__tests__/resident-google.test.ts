import { describe, expect, it, vi } from "vitest";
import { isGoogleSession, residentGoogleError } from "../resident-google";
import { requireResidentGoogle } from "../resident-google.server";

describe("resident Google server authorization", () => {
  it("accepts only the server-confirmed registered resident", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "allowed", error: null });
    await expect(requireResidentGoogle({ rpc } as never)).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("resident_google_access");
  });
  for (const status of ["unregistered", "duplicate", "inactive", "link_required", "unverified"]) {
    it(`denies ${status} resident authorization`, async () => {
      await expect(requireResidentGoogle({ rpc: vi.fn().mockResolvedValue({ data: status, error: null }) } as never)).rejects.toThrow(residentGoogleError(status) ?? "denied");
    });
  }
  it("fails closed on lookup errors", async () => {
    await expect(requireResidentGoogle({ rpc: vi.fn().mockResolvedValue({ data: "allowed", error: {} }) } as never)).rejects.toThrow("couldn't verify");
  });
  it("does not apply the Google gate to username/password or phone sessions", () => {
    const user = { identities: [{ provider: "google" }] };
    expect(isGoogleSession(user, { amr: [{ method: "password" }] })).toBe(false);
    expect(isGoogleSession(user, { amr: [{ method: "otp" }] })).toBe(false);
    expect(isGoogleSession(user, { amr: [{ method: "oauth" }] })).toBe(true);
  });
});