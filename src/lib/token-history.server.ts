import { tokenHistoryRange } from "./token-history-pagination";

/** Keep ownership and source filters in the database before count/range. */
export async function readTokenHistoryPage(
  supabase: any,
  input: { page: number; page_size: number; meter_id?: string | null; source?: "all" | "admin" | "vendor" },
  vendorId?: string,
) {
  if (vendorId && input.meter_id) {
    const { data: meter, error } = await supabase.from("meters").select("id")
      .eq("id", input.meter_id).eq("vendor_id", vendorId).maybeSingle();
    if (error) throw new Error("Could not verify meter access");
    if (!meter) throw new Error("Meter not found");
  }

  let query = supabase.from("meter_tokens")
    .select(vendorId ? "*, meters!inner(vendor_id)" : "*", { count: "exact" });
  if (vendorId) query = query.eq("meters.vendor_id", vendorId);
  if (input.meter_id) query = query.eq("meter_id", input.meter_id);

  if (input.source && input.source !== "all") {
    const roles: { user_id: string; role: string }[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from("user_roles").select("user_id, role")
        .in("role", ["admin", "vendor"]).order("id").range(offset, offset + 999);
      if (error) throw new Error("Could not load token sources");
      roles.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
    }
    const admins = new Set(roles.filter(r => r.role === "admin").map(r => r.user_id));
    const ids = [...new Set(roles.filter(r => input.source === "admin"
      ? r.role === "admin" : r.role === "vendor" && !admins.has(r.user_id)).map(r => r.user_id))];
    if (!ids.length) return { rows: [], total: 0, page: 1, page_size: input.page_size };
    query = query.in("issued_by", ids);
  }

  const range = tokenHistoryRange(input.page, input.page_size);
  const { data: rows, count, error } = await query
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .range(range.from, range.to);
  if (error) throw new Error("Could not load token history");
  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / input.page_size));
  if (input.page > lastPage) return readTokenHistoryPage(supabase, { ...input, page: lastPage }, vendorId);
  // The ownership join is used only for filtering; don't return relationship metadata.
  return { rows: (rows ?? []).map(({ meters: _meters, ...row }: any) => row), total,
    page: input.page, page_size: input.page_size };
}