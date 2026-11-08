import { describe, expect, it } from "vitest";
import { readPropertyUnits } from "../property-units.server";

function client(rows: { id: string; property_id: string }[], failure = false) {
  const query = {
    select: () => query,
    eq: (_column: string, id: string) => { rows = rows.filter((r) => r.property_id === id); return query; },
    order: () => query,
    range: async (start: number, end: number) => ({
      data: failure ? null : rows.slice(start, end + 1),
      error: failure ? { message: "Read denied" } : null,
    }),
  };
  return { from: () => query } as unknown as Parameters<typeof readPropertyUnits>[0];
}

describe("property unit totals", () => {
  const rows = Array.from({ length: 1201 }, (_, i) => ({ id: String(i), property_id: i < 1100 ? "a" : "b" }));
  it("counts every actual unit beyond the 1000-row response cap", async () => {
    const units = await readPropertyUnits(client(rows));
    expect(units).toHaveLength(1201);
    expect(units.filter((u) => u.property_id === "a")).toHaveLength(1100);
    expect(units.filter((u) => u.property_id === "b")).toHaveLength(101);
  });
  it("returns the same complete property scope for detail rows", async () => {
    const units = await readPropertyUnits(client(rows), "a");
    expect(units).toHaveLength(1100);
    expect(units.every((u) => u.property_id === "a")).toBe(true);
  });
  it("returns zero for a property without units", async () => {
    expect(await readPropertyUnits(client(rows), "empty")).toEqual([]);
  });
  it("does not present failed reads as zero or partial totals", async () => {
    await expect(readPropertyUnits(client(rows, true))).rejects.toThrow("Read denied");
  });
});