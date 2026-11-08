import { describe, expect, it, vi } from "vitest";
import { readAll } from "../landlord-scope.server";

function pagedUnits(rows: { id: string; property_id: string }[]) {
  const range = vi.fn(async (start: number, end: number) => ({
    data: rows.slice(start, end + 1), error: null,
  }));
  return { build: () => ({ range }), range };
}

describe("complete property unit counts", () => {
  it("matches list totals to detail units even when combined properties exceed 1,000 rows", async () => {
    const rows = Array.from({ length: 1201 }, (_, index) => ({
      id: String(index), property_id: index < 801 ? "first" : "second",
    }));
    const list = pagedUnits(rows);
    const allUnits = await readAll(list.build);
    for (const [property, expected] of [["first", 801], ["second", 400]] as const) {
      const details = await readAll(pagedUnits(rows.filter(u => u.property_id === property)).build);
      expect(allUnits.filter(u => u.property_id === property).length).toBe(expected);
      expect(details.length).toBe(expected);
    }
    expect(list.range.mock.calls).toEqual([[0, 499], [500, 999], [1000, 1499]]);
  });

  it("loads all 5,000 units of one property without truncation or duplicates", async () => {
    const source = pagedUnits(Array.from({ length: 5000 }, (_, index) => ({
      id: String(index), property_id: "large",
    })));
    const units = await readAll(source.build);
    expect(units.length).toBe(5000);
    expect(new Set(units.map(u => u.id)).size).toBe(5000);
  });

  it("returns zero for a property without units", async () => {
    expect(await readAll(pagedUnits([]).build)).toEqual([]);
  });

  it("fails instead of showing a misleading partial count when a later page fails", async () => {
    const range = vi.fn().mockResolvedValueOnce({
      data: Array.from({ length: 500 }, (_, id) => ({ id })), error: null,
    }).mockResolvedValueOnce({ data: null, error: { message: "Could not load units" } });
    await expect(readAll(() => ({ range }))).rejects.toThrow("Could not load units");
  });
});