import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { commissionSettingsKey, refreshAdminPricing } from "../admin-pricing-refresh";

describe("administrator persisted commission refresh", () => {
  it("refetches saved payer and rates and current meter records", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let saved = { commission_payer: "resident", commission_percentage: 5, vat_on_commission_percentage: 16 };
    let meters = [{ id: "a", owner_id: "first", commission_percentage: 3 }, { id: "b", owner_id: "second", commission_percentage: 7 }];
    const settings = new QueryObserver(client, { queryKey: commissionSettingsKey, queryFn: async () => saved });
    const registry = new QueryObserver(client, { queryKey: ["meters"], queryFn: async () => meters });
    const stopSettings = settings.subscribe(() => {});
    const stopMeters = registry.subscribe(() => {});
    await Promise.all([settings.refetch(), registry.refetch()]);
    saved = { commission_payer: "owner", commission_percentage: 8, vat_on_commission_percentage: 12 };
    meters = meters.map((meter) => meter.id === "a" ? { ...meter, commission_percentage: 4 } : meter);
    await refreshAdminPricing(client);
    expect(client.getQueryData(commissionSettingsKey)).toEqual(saved);
    expect(client.getQueryData(["meters"])).toEqual([{ id: "a", owner_id: "first", commission_percentage: 4 }, { id: "b", owner_id: "second", commission_percentage: 7 }]);
    stopSettings(); stopMeters(); client.clear();
  });

  it("reports refresh failures without replacing persisted values with unsaved drafts", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const persisted = { commission_payer: "resident", commission_percentage: 5, vat_on_commission_percentage: 16 };
    client.setQueryData(commissionSettingsKey, persisted);
    const observer = new QueryObserver(client, { queryKey: commissionSettingsKey, queryFn: async () => { throw new Error("Read failed"); }, staleTime: Infinity });
    const stop = observer.subscribe(() => {});
    await expect(refreshAdminPricing(client)).rejects.toThrow("Read failed");
    expect(client.getQueryData(commissionSettingsKey)).toEqual(persisted);
    stop(); client.clear();
  });
});