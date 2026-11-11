import { describe, expect, it } from "vitest";
import { readVendorAssignableProperties } from "../vendor-assignable-properties.server";

function database(rows: { id: string; name: string }[], denied = new Set<string>(), failure = false) {
  const query = {
    select: () => query,
    order: () => query,
    range: async (start: number, end: number) => ({ data: rows.slice(start, end + 1), error: failure ? { message: "Read failed" } : null }),
  };
  return {
    from: (table: string) => {
      expect(table).toBe("properties");
      return query;
    },
    rpc: async (_name: string, args: { p_property: string }) => ({ data: !denied.has(args.p_property), error: null }),
  };
}

describe("vendor property assignment options", () => {
  it("includes THE 46 RESIDENCY ANNEX beyond a 1000-row page without requiring any units", async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: `p${i}`, name: `Property ${i}` }));
    rows.push({ id: "annex", name: "THE 46 RESIDENCY ANNEX" });
    const result = await readVendorAssignableProperties(database(rows));
    expect(result).toHaveLength(1001);
    expect(result).toContainEqual({ id: "annex", name: "THE 46 RESIDENCY ANNEX" });
  });
  it("excludes properties the vendor cannot manage", async () => {
    const rows = [{ id: "own", name: "Assigned by administrator" }, { id: "foreign", name: "Other vendor" }];
    expect(await readVendorAssignableProperties(database(rows, new Set(["foreign"])))).toEqual([rows[0]]);
  });
  it("does not silently return an empty list when reading fails", async () => {
    await expect(readVendorAssignableProperties(database([], new Set(), true))).rejects.toThrow("Read failed");
  });
});