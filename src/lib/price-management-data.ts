/** Bounded requests without limiting the total selection. Stop on the first failure. */
export async function runPriceBatches<T>(ids: string[], run: (batch: string[]) => Promise<T>, completed: (result: T, batch: string[]) => void) {
  const unique = [...new Set(ids)];
  for (let start = 0; start < unique.length; start += 500) {
    const batch = unique.slice(start, start + 500);
    completed(await run(batch), batch);
  }
}

/** Owner totals are independent of search, utility and status filters. */
export function priceOwnerMeters<T extends { vendor_id: string; landlord_id: string | null; property_landlord_id?: string | null; agent_id: string | null }>(meters: T[], role: string, owner: string) {
  return meters.filter(m => {
    if (role === "all") return true;
    if (role === "landlord") return owner === "all"
      ? Boolean(m.landlord_id || m.property_landlord_id)
      : m.landlord_id === owner || m.property_landlord_id === owner;
    const id = role === "agent" ? m.agent_id : m.vendor_id;
    return Boolean(id) && (owner === "all" || id === owner);
  });
}

export function pricePropertyOptions(meters: { property_id: string | null; property_name: string | null }[]) {
  const properties = new Map<string, string>();
  for (const meter of meters) {
    if (meter.property_id) properties.set(meter.property_id, meter.property_name ?? "Unnamed property");
  }
  return [...properties].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export function matchesPriceProperty(meter: { property_id: string | null }, property: string) {
  return property === "all" || (meter.property_id ?? "none") === property;
}

export function matchesPriceVendor(meter: { vendor_id: string }, vendor: string) {
  return vendor === "all" || meter.vendor_id === vendor;
}