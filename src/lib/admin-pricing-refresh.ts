import type { QueryClient } from "@tanstack/react-query";
import { ownerCommissionKey, ownerCommissionTargetsKey } from "./owner-commission";

export const commissionSettingsKey = ["commission-settings"] as const;
export const commissionRefreshInterval = 30_000;

export async function refreshOwnerCommission(client: QueryClient) {
  await Promise.all([
    client.invalidateQueries({ queryKey: ownerCommissionKey }, { throwOnError: true }),
    client.invalidateQueries({ queryKey: ["vendor-price-meters"] }, { throwOnError: true }),
  ]);
}

/** Read persisted values, never promote form drafts into the cache. */
export async function refreshAdminPricing(client: QueryClient) {
  await Promise.all([
    refreshOwnerCommission(client),
    client.invalidateQueries({ queryKey: ownerCommissionTargetsKey }, { throwOnError: true }),
    client.invalidateQueries({ queryKey: commissionSettingsKey }, { throwOnError: true }),
    client.invalidateQueries({ queryKey: ["meters"] }, { throwOnError: true }),
  ]);
}