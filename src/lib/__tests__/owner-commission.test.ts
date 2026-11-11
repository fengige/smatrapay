import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { commissionForOwner, ownerCommissionInput, ownerCommissionKey, type OwnerCommission } from "../owner-commission";
import { refreshOwnerCommission } from "../admin-pricing-refresh";

const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
const config = (owner_id: string, commission_payer: "owner" | "resident", commission_percentage: number, vat_on_commission_percentage: number): OwnerCommission => ({ owner_id, commission_payer, commission_percentage, vat_on_commission_percentage, updated_at: "2026-11-10T21:00:00Z", updated_by: null });

describe("owner commission persisted pricing source", () => {
  it("maps distinct owner rates and opposite payers without borrowing managing vendor settings", () => {
    const settings = [config(first, "owner", 8, 12), config(second, "resident", 5, 16)];
    const meters = [{ owner_id: first, vendor_id: second }, { owner_id: first, vendor_id: second }, { owner_id: second, vendor_id: first }];
    expect(meters.map(meter => commissionForOwner(meter.owner_id, settings))).toEqual([settings[0], settings[0], settings[1]]);
  });

  it("returns no configuration for missing or unassigned owners", () => {
    const settings = [config(first, "owner", 8, 12)];
    expect(commissionForOwner(second, settings)).toBeNull();
    expect(commissionForOwner(null, settings)).toBeNull();
  });

  it("refreshes every row for the saved owner while leaving another owner's values unchanged", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let persisted = [config(first, "resident", 5, 16), config(second, "resident", 7, 9)];
    const observer = new QueryObserver(client, { queryKey: ownerCommissionKey, queryFn: async () => persisted });
    const stop = observer.subscribe(() => {});
    await observer.refetch();
    persisted = [config(first, "owner", 8, 12), config(second, "resident", 7, 9)];
    await refreshOwnerCommission(client);
    const saved = client.getQueryData<OwnerCommission[]>(ownerCommissionKey) ?? [];
    expect([first, first, second].map(owner => commissionForOwner(owner, saved))).toEqual(persisted.length ? [persisted[0], persisted[0], persisted[1]] : []);
    // A later filter/page joins the same refreshed persisted source.
    expect(commissionForOwner(first, saved)).toMatchObject({ commission_payer: "owner", commission_percentage: 8, vat_on_commission_percentage: 12 });
    stop(); client.clear();
  });

  it("gets externally changed persisted rates on the next refresh", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let persisted = [config(first, "resident", 5, 16)];
    const observer = new QueryObserver(client, { queryKey: ownerCommissionKey, queryFn: async () => persisted });
    const stop = observer.subscribe(() => {});
    await observer.refetch();
    persisted = [config(first, "owner", 4.25, 10.5)];
    await refreshOwnerCommission(client);
    expect(client.getQueryData(ownerCommissionKey)).toEqual(persisted);
    stop(); client.clear();
  });

  it("does not replace persisted owner values with drafts when refresh fails", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const saved = [config(first, "resident", 5, 16)];
    client.setQueryData(ownerCommissionKey, saved);
    const observer = new QueryObserver(client, { queryKey: ownerCommissionKey, staleTime: Infinity, queryFn: async () => { throw new Error("Read failed"); } });
    const stop = observer.subscribe(() => {});
    await expect(refreshOwnerCommission(client)).rejects.toThrow("Read failed");
    expect(client.getQueryData(ownerCommissionKey)).toEqual(saved);
    stop(); client.clear();
  });

  it.each([[-1, 16], [101, 16], [5, -1], [5, 101]])("rejects out-of-range rates %s / %s", (commission_percentage, vat_on_commission_percentage) => {
    expect(ownerCommissionInput.safeParse({ owner_type: "landlord", property_scope: "all", owner_id: first, commission_payer: "owner", commission_percentage, vat_on_commission_percentage }).success).toBe(false);
  });
  it("requires an Owner or Resident payer", () => {
    expect(ownerCommissionInput.safeParse({ owner_type: "landlord", property_scope: "all", owner_id: first, commission_payer: "", commission_percentage: 5, vat_on_commission_percentage: 16 }).success).toBe(false);
  });
  it("accepts zero and one hundred percent", () => {
    expect(ownerCommissionInput.parse({ owner_type: "landlord", property_scope: "all", owner_id: first, property_id: null, commission_payer: "resident", commission_percentage: 0, vat_on_commission_percentage: 100 })).toMatchObject({ commission_percentage: 0, vat_on_commission_percentage: 100 });
  });
});
describe("owner commission property scope", () => {
  const owner = "33333333-3333-4333-8333-333333333333";
  const propA = "44444444-4444-4444-8444-444444444444";
  const propB = "55555555-5555-4555-8555-555555555555";
  const base = { owner_id: owner, updated_at: "2026-11-10T21:00:00Z", updated_by: null };
  const all: OwnerCommission = { ...base, property_id: null, commission_payer: "resident", commission_percentage: 10, vat_on_commission_percentage: 16 };
  const specific: OwnerCommission = { ...base, property_id: propA, commission_payer: "owner", commission_percentage: 5, vat_on_commission_percentage: 8 };

  it("uses the property-specific configuration for meters in that property", () => {
    expect(commissionForOwner(owner, [all, specific], propA)).toBe(specific);
  });
  it("falls back to the all-properties configuration for other properties", () => {
    expect(commissionForOwner(owner, [all, specific], propB)).toBe(all);
    expect(commissionForOwner(owner, [all, specific], null)).toBe(all);
  });
  it("shows not configured when only another property is configured", () => {
    expect(commissionForOwner(owner, [specific], propB)).toBeNull();
  });
});
