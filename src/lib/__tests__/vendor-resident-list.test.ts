import { describe, expect, it } from "vitest";
import { readVendorResidentListIds } from "../vendor-resident-list.server";

describe("vendor resident list", () => {
  it("reads all eligible residents beyond the 500-row batch without duplicates", async () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({ user_id: `resident-${i}` }));
    const db = { rpc: (name: string) => {
      expect(name).toBe("vendor_resident_list_ids");
      return { order: () => ({ range: async (start: number, end: number) => ({ data: rows.slice(start, end + 1), error: null }) }) };
    } };
    const ids = await readVendorResidentListIds(db);
    expect(ids).toHaveLength(501);
    expect(ids[500]).toBe("resident-500");
  });
  it("never silently returns a partial list on access failure", async () => {
    const db = { rpc: () => ({ order: () => ({ range: async () => ({ data: null, error: { message: "Access denied" } }) }) }) };
    await expect(readVendorResidentListIds(db)).rejects.toThrow("Access denied");
  });
});