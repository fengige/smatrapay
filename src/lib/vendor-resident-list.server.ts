/** The caller-bound RPC proves both resident role and vendor relationship under RLS. */
export async function readVendorResidentListIds(db: { rpc: (name: string) => any }): Promise<string[]> {
  const ids = new Set<string>();
  for (let start = 0; ; start += 500) {
    const { data, error } = await db.rpc("vendor_resident_list_ids").order("user_id").range(start, start + 499);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) ids.add(row.user_id);
    if (!data || data.length < 500) return [...ids];
  }
}