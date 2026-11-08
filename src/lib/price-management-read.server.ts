import { readAll } from "./landlord-scope.server";

export async function readPricingRelated(db: any, table: string, columns: string, ids: string[]) {
  const rows: any[] = [];
  const unique = [...new Set(ids.filter(Boolean))];
  for (let start = 0; start < unique.length; start += 200) {
    rows.push(...await readAll(() => db.from(table).select(columns)
      .in("id", unique.slice(start, start + 200)).order("id")));
  }
  return rows;
}

/** The caller authorizes the portal; the supplied client retains its RLS scope. */
export async function readPricingRequests(db: any, vendorId?: string) {
  return readAll(() => {
    let query = db.from("meter_price_change_requests")
      .select("id,created_at,reviewed_at,meter_id,vendor_id,current_price,requested_price,status,note,review_note");
    if (vendorId) query = query.eq("vendor_id", vendorId);
    return query.order("created_at", { ascending: false }).order("id", { ascending: false });
  });
}