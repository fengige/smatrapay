/** Bounded requests without limiting the total selection. Stop on the first failure. */
export async function runPriceBatches<T>(ids: string[], run: (batch: string[]) => Promise<T>, completed: (result: T, batch: string[]) => void) {
  const unique = [...new Set(ids)];
  for (let start = 0; start < unique.length; start += 500) {
    const batch = unique.slice(start, start + 500);
    completed(await run(batch), batch);
  }
}

/** Owner totals are independent of search, utility and status filters. */
export function priceOwnerMeters<T extends { vendor_id: string; landlord_id: string | null; agent_id: string | null }>(meters: T[], role: string, owner: string) {
  return meters.filter(m => {
    if (role === "all") return true;
    const id = role === "landlord" ? m.landlord_id : role === "agent" ? m.agent_id : m.vendor_id;
    return Boolean(id) && (owner === "all" || id === owner);
  });
}