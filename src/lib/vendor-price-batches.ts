import type { VendorPriceResult } from "./vendor-admin.functions";

/** Keep each authenticated request below validation and Data API row limits. */
export async function submitVendorPriceBatches(
  ids: string[],
  submit: (batch: string[]) => Promise<VendorPriceResult>,
  onCompleted: (ids: string[], total: VendorPriceResult) => void,
): Promise<VendorPriceResult> {
  const uniqueIds = [...new Set(ids)];
  const total: VendorPriceResult = { submitted: 0, unchanged: 0, changes: [] };
  for (let offset = 0; offset < uniqueIds.length; offset += 500) {
    const batch = uniqueIds.slice(offset, offset + 500);
    const result = await submit(batch);
    total.submitted += result.submitted;
    total.unchanged += result.unchanged;
    total.changes.push(...result.changes);
    onCompleted(batch, total);
  }
  return total;
}