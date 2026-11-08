import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Keep list totals and detail rows complete beyond the Data API response cap.
export async function readPropertyUnits(
  supabase: Pick<SupabaseClient<Database>, "from">,
  propertyId?: string,
) {
  const units: Database["public"]["Tables"]["units"]["Row"][] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase.from("units").select("*");
    if (propertyId) query = query.eq("property_id", propertyId);
    const { data, error } = await query
      .order("unit_number", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    units.push(...(data ?? []));
    if ((data?.length ?? 0) < pageSize) return units;
  }
}