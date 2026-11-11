import { readAll } from "@/lib/landlord-scope.server";

type PropertyOption = { id: string; name: string };
type Client = { from: (table: string) => any; rpc: (name: string, args: { p_property: string }) => PromiseLike<{ data: unknown; error: { message: string } | null }> };

/** Read property records, not a capped or incomplete list of their units. */
export async function readVendorAssignableProperties(db: Client): Promise<PropertyOption[]> {
  const rows: PropertyOption[] = await readAll(() => db.from("properties")
    .select("id, name").order("name").order("id"));
  const allowed: PropertyOption[] = [];
  for (let start = 0; start < rows.length; start += 50) {
    const checked = await Promise.all(rows.slice(start, start + 50).map(async (property) => {
      const { data, error } = await db.rpc("can_manage_property_landlords", { p_property: property.id });
      if (error) throw new Error(error.message);
      return data === true ? property : null;
    }));
    for (const property of checked) if (property) allowed.push(property);
  }
  return allowed;
}