import { describe, expect, it, vi } from "vitest";
import { eligibleLandlordAccountRoles, landlordAccountPasswordInput } from "../landlord-account";
import { applyLandlordPassword, authorizeLandlordAccount, managedLandlordAccount } from "../landlord-account.server";

const id = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";
const valid = { id, password: "NewLandlord9!", confirmation: "NewLandlord9!" };
function scopedClient({ vendor = true, profile = { id, created_by: actor } as { id: string; created_by: string } | null, properties = [] as { id: string }[], links = [] as { property_id: string }[], managed = false } = {}) {
  return {
    rpc: vi.fn(async (name: string) => ({ data: name === "has_role" ? vendor : managed, error: null })),
    from: vi.fn((table: string) => {
      const chain: Record<string, any> = {};
      for (const method of ["select", "eq", "order"]) chain[method] = vi.fn(() => chain);
      chain["maybeSingle"] = vi.fn(async () => ({ data: profile, error: null }));
      chain["range"] = vi.fn(async () => ({ data: table === "properties" ? properties : links, error: null }));
      return chain;
    }),
  };
}
describe("Landlord password validation", () => {
  it("requires matching confirmation", () => expect(landlordAccountPasswordInput.safeParse({ ...valid, confirmation: "Different9!" }).success).toBe(false));
  it.each(["abc12", "A".repeat(73)])("rejects invalid length", password => expect(landlordAccountPasswordInput.safeParse({ ...valid, password, confirmation: password }).success).toBe(false));
  it("accepts a valid password", () => expect(landlordAccountPasswordInput.safeParse(valid).success).toBe(true));
  it("accepts landlord-only identities", () => expect(eligibleLandlordAccountRoles(["landlord", "user"])).toBe(true));
  it.each(["admin", "vendor", "agent", "resident", "service_provider", "moderator"])("rejects mixed privileged role %s", role => expect(eligibleLandlordAccountRoles(["landlord", role])).toBe(false));
});
describe("Vendor landlord account authorization", () => {
  it("denies non-vendors before any profile reads", async () => {
    const client = scopedClient({ vendor: false });
    await expect(authorizeLandlordAccount(client as never, actor, id)).rejects.toThrow("Vendor access required");
    expect(client.from).not.toHaveBeenCalled();
  });
  it("denies self management", async () => { await expect(authorizeLandlordAccount(scopedClient() as never, id, id)).rejects.toThrow("Access denied"); });
  it("denies foreign profiles", async () => { await expect(authorizeLandlordAccount(scopedClient({ profile: null }) as never, actor, id)).rejects.toThrow("Access denied"); });
  it("allows vendor-created landlords without properties", async () => { await expect(authorizeLandlordAccount(scopedClient() as never, actor, id)).resolves.toMatchObject({ id }); });
  it("denies mere profile visibility without management relationships", async () => { await expect(authorizeLandlordAccount(scopedClient({ profile: { id, created_by: id } }) as never, actor, id)).rejects.toThrow("properties you manage"); });
  it.each(["properties", "links"])("allows currently managed %s relationship", async relationship => {
    const client = scopedClient({ profile: { id, created_by: id }, managed: true, ...(relationship === "links" ? { links: [{ property_id: "property-a" }] } : { properties: [{ id: "property-a" }] }) });
    await expect(authorizeLandlordAccount(client as never, actor, id)).resolves.toMatchObject({ id });
    expect(client.rpc).toHaveBeenCalledWith("can_manage_property_landlords", { p_property: "property-a" });
  });
  it("denies linked properties the vendor cannot manage", async () => { await expect(authorizeLandlordAccount(scopedClient({ profile: { id, created_by: id }, links: [{ property_id: "foreign" }] }) as never, actor, id)).rejects.toThrow("properties you manage"); });
  it("rejects landlord accounts with administrator access before password updates", async () => {
    const admin = { from: () => ({ select: () => ({ eq: async () => ({ data: [{ role: "landlord" }, { role: "admin" }] }) }) }), auth: { admin: { getUserById: async () => ({ data: { user: { id } } }) } } };
    await expect(managedLandlordAccount(admin as never, id)).rejects.toThrow("not eligible");
  });
});
describe("Landlord provider updates and password-free history", () => {
  function adminClient(providerError = false, auditError = false) {
    const insert = vi.fn(async () => ({ error: auditError ? { message: "Unavailable" } : null }));
    const updateUserById = vi.fn(async () => ({ data: { user: providerError ? null : { id } }, error: providerError ? { message: "Rejected" } : null }));
    return { from: vi.fn(() => ({ insert })), auth: { admin: { updateUserById } }, insert };
  }
  it("updates the target Auth password, audits and notifies only that landlord", async () => {
    const admin = adminClient();
    await expect(applyLandlordPassword(admin as never, actor, id, valid.password)).resolves.toEqual({ ok: true, auditRecorded: true, landlordNotified: true });
    expect(admin.auth.admin.updateUserById).toHaveBeenCalledWith(id, { password: valid.password });
    expect(admin.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: id, actor_id: actor, action: "landlord_password_changed" }));
    expect(admin.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: id, type: "account_security" }));
    expect(JSON.stringify(admin.insert.mock.calls)).not.toContain(valid.password);
  });
  it("does not report provider failure as success or notify a successful change", async () => {
    const admin = adminClient(true);
    await expect(applyLandlordPassword(admin as never, actor, id, valid.password)).rejects.toThrow("Could not update");
    expect(admin.insert).toHaveBeenCalledWith(expect.objectContaining({ action: "landlord_password_change_failed" }));
    expect(admin.from).not.toHaveBeenCalledWith("notifications");
  });
  it("does not change a password if initial audit fails", async () => {
    const admin = adminClient(false, true);
    await expect(applyLandlordPassword(admin as never, actor, id, valid.password)).rejects.toThrow("unavailable");
    expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled();
  });
});