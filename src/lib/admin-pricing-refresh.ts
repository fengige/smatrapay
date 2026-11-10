import type { QueryClient } from "@tanstack/react-query";

export const commissionSettingsKey = ["commission-settings"] as const;
export const commissionRefreshInterval = 30_000;

/** Read persisted values, never promote form drafts into the cache. */
export async function refreshAdminPricing(client: QueryClient) {
  await Promise.all([
    client.invalidateQueries({ queryKey: commissionSettingsKey }, { throwOnError: true }),
    client.invalidateQueries({ queryKey: ["meters"] }, { throwOnError: true }),
  ]);
}