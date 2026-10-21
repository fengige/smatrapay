import { describe, expect, it, vi } from "vitest";
import { eligibleResidentRoles, residentAccountPasswordInput } from "../resident-account";
import { applyResidentPassword, authorizeResidentAccount, managedResidentAccount } from "../resident-account.server";

const id = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";
const valid = { id, portal: "vendor", password: "NewResident9!", confirmation: "NewResident9!" };
function query(result: unknown) {
  const chain: Record<string, any> = {};
  for (const method of ["select", "eq", "is", "limit"]) chain[method] = vi.fn(() => chain);
  chain["maybeSingle"] = vi.fn(async () => result);
  return chain;
}
function scopedClient(allowed: boolean, profile: unknown, assignment: unknown) {
  return { rpc: vi.fn(async () => ({ data: allowed })), from: vi.fn((table: string) => query({ data: table === "users" ? profile : assignment })) };
}
describe("Resident managed password policy", () => {
  it("rejects mismatched confirmation", () => expect(residentAccountPasswordInput.safeParse({ ...valid, confirmation: "Different9!" }).success).toBe(false));
  it.each(["abc12", "A".repeat(73)])("rejects passwords outside 6–72 characters: %s", (password) => expect(residentAccountPasswordInput.safeParse({ ...valid, password, confirmation: password }).success).toBe(false));
  it.each(["simple", "lowercase", "123456"])("accepts passwords without character-type rules: %s", (password) => expect(residentAccountPasswordInput.safeParse({ ...valid, password, confirmation: password }).success).toBe(true));
  it("rejects non-resident accounts", () => expect(eligibleResidentRoles(["user"])).toBe(false));
  it.each(["admin", "vendor", "moderator", "landlord", "agent", "service_provider"])("rejects resident with privileged role %s", (role) => expect(eligibleResidentRoles(["resident", role])).toBe(false));
});
describe("Resident account server authorization", () => {
  it("denies staff without admin management access", async () => {
    const client = scopedClient(false, { id }, { id });
    await expect(authorizeResidentAccount(client as never, actor, { id, portal: "admin" })).rejects.toThrow("Access denied");
    expect(client.from).not.toHaveBeenCalled();
  });
  it("denies an out-of-scope resident", async () => {
    await expect(authorizeResidentAccount(scopedClient(true, null, null) as never, actor, { id, portal: "vendor" })).rejects.toThrow("Access denied");
  });
  it("denies historical assignments without an active vendor assignment", async () => {
    await expect(authorizeResidentAccount(scopedClient(true, { id }, null) as never, actor, { id, portal: "vendor" })).rejects.toThrow("Access denied");
  });
  it("allows vendors with a current RLS-scoped assignment", async () => {
    const client = scopedClient(true, { id }, { id });
    await expect(authorizeResidentAccount(client as never, actor, { id, portal: "vendor" })).resolves.toEqual({ id });
  });
  it("denies self password takeover through management", async () => {
    await expect(authorizeResidentAccount(scopedClient(true, { id }, { id }) as never, id, { id, portal: "admin" })).rejects.toThrow("Access denied");
  });
  it("checks the actual Auth account and rejects mixed roles", async () => {
    const chain = query({});
    chain["eq"] = vi.fn(async () => ({ data: [{ role: "resident" }, { role: "admin" }] }));
    const admin = { from: () => chain, auth: { admin: { getUserById: vi.fn(async () => ({ data: { user: { id } } })) } } };
    await expect(managedResidentAccount(admin as never, id)).rejects.toThrow("not eligible");
    expect(admin.auth.admin.getUserById).toHaveBeenCalledWith(id);
  });
});
describe("Auth password update and audit", () => {
  function adminClient(providerError: boolean, auditError = false) {
    const insert = vi.fn(async () => ({ error: auditError ? { message: "Unavailable" } : null }));
    const updateUserById = vi.fn(async () => ({ data: { user: providerError ? null : { id } }, error: providerError ? { message: "Provider rejected" } : null }));
    return { from: vi.fn(() => ({ insert })), auth: { admin: { updateUserById } }, insert };
  }
  it("changes the actual Auth password and writes password-free success audit and notification", async () => {
    const admin = adminClient(false);
    expect(await applyResidentPassword(admin as never, actor, id, valid.password)).toEqual({ ok: true, auditRecorded: true, residentNotified: true });
    expect(admin.auth.admin.updateUserById).toHaveBeenCalledWith(id, { password: valid.password });
    expect(admin.insert).toHaveBeenCalledWith(expect.objectContaining({ actor_id: actor, user_id: id, action: "resident_password_changed", changes: { outcome: "success" } }));
    expect(JSON.stringify(admin.insert.mock.calls)).not.toContain(valid.password);
  });
  it("never reports success if Auth rejects update", async () => {
    const admin = adminClient(true);
    await expect(applyResidentPassword(admin as never, actor, id, valid.password)).rejects.toThrow("Could not update");
    expect(admin.insert).toHaveBeenCalledWith(expect.objectContaining({ action: "resident_password_change_failed" }));
  });
  it("does not change Auth password when audit storage is unavailable", async () => {
    const admin = adminClient(false, true);
    await expect(applyResidentPassword(admin as never, actor, id, valid.password)).rejects.toThrow("unavailable");
    expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled();
  });
});