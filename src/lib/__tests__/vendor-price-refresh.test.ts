import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { expect, it } from "vitest";
import { refreshOwnerCommission } from "../admin-pricing-refresh";

it("successful owner configuration saves refresh the vendor persisted meter query", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let saved = { commission_payer: "resident", commission_percentage: 5, vat_on_commission_percentage: 16 };
  const observer = new QueryObserver(client, { queryKey: ["vendor-price-meters"], queryFn: async () => saved });
  const stop = observer.subscribe(() => {});
  await observer.refetch();
  saved = { commission_payer: "owner", commission_percentage: 4.25, vat_on_commission_percentage: 10.5 };
  await refreshOwnerCommission(client);
  expect(client.getQueryData(["vendor-price-meters"])).toEqual({ commission_payer: "owner", commission_percentage: 4.25, vat_on_commission_percentage: 10.5 });
  stop(); client.clear();
});