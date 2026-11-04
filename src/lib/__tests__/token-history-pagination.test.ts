import { describe, expect, it } from "vitest";
import { readTokenHistoryPage } from "../token-history.server";
import { tokenHistoryPageSchema, tokenHistorySearch } from "../token-history-pagination";

const rows = Array.from({ length: 45 }, (_, i) => ({ id: String(i).padStart(3, "0"),
  created_at: "2026-11-04", meter_id: i < 25 ? "meter-a" : "meter-b",
  issued_by: i % 2 ? "admin-a" : "vendor-a", meters: { vendor_id: i < 25 ? "vendor-a" : "vendor-b" } }));

function database(fail = false, dualRole = false) {
  const ranges: number[][] = [];
  const calls: string[] = [];
  const db = { from(table: string) {
    calls.push(table);
    const filters: ((r: any) => boolean)[] = [];
    const builder: any = {
      select: () => builder,
      eq: (key: string, value: unknown) => { filters.push(r => key === "meters.vendor_id" ? r.meters.vendor_id === value : r[key] === value); return builder; },
      in: (key: string, ids: unknown[]) => { filters.push(r => ids.includes(r[key])); return builder; },
      order: () => builder,
      maybeSingle: async () => ({ data: [{ id: "meter-a", vendor_id: "vendor-a" }, { id: "meter-b", vendor_id: "vendor-b" }].filter(r => filters.every(f => f(r)))[0] ?? null, error: null }),
      range: async (from: number, to: number) => {
        if (table === "user_roles") return { data: [{ user_id: "admin-a", role: "admin" }, { user_id: "vendor-a", role: "vendor" }, ...(dualRole ? [{ user_id: "vendor-a", role: "admin" }] : [])].slice(from, to + 1), error: null };
        ranges.push([from, to]);
        const filtered = rows.filter(r => filters.every(f => f(r)));
        return { data: filtered.slice(from, to + 1), count: filtered.length, error: fail ? new Error("private database error") : null };
      },
    };
    return builder;
  } };
  return { db, ranges, calls };
}

describe("paged token history", () => {
  it("returns separate bounded pages and an exact total", async () => {
    const { db, ranges } = database();
    const first = await readTokenHistoryPage(db, { page: 1, page_size: 20 });
    const next = await readTokenHistoryPage(db, { page: 2, page_size: 20 });
    expect(first.rows).toHaveLength(20);
    expect(first.total).toBe(45);
    expect(next.rows[0]?.["id"]).toBe("020");
    expect(first.rows.some(r => next.rows.some(n => n["id"] === r["id"]))).toBe(false);
    expect(ranges).toEqual([[0, 19], [20, 39]]);
  });
  it("scopes both results and count to the authenticated vendor", async () => {
    const { db } = database();
    const page = await readTokenHistoryPage(db, { page: 2, page_size: 20 }, "vendor-a");
    expect(page.total).toBe(25);
    expect(page.rows).toHaveLength(5);
    expect(page.rows.every(r => r["meter_id"] === "meter-a")).toBe(true);
    expect(page.rows.every(r => !("meters" in r))).toBe(true);
  });
  it("rejects a foreign meter before reading tokens", async () => {
    const { db, calls } = database();
    await expect(readTokenHistoryPage(db, { page: 1, page_size: 20, meter_id: "meter-b" }, "vendor-a")).rejects.toThrow("Meter not found");
    expect(calls).toEqual(["meters"]);
  });
  it("filters source before pagination and counting", async () => {
    const { db } = database();
    const page = await readTokenHistoryPage(db, { page: 2, page_size: 10, source: "vendor" });
    expect(page.total).toBe(23);
    expect(page.rows).toHaveLength(10);
    expect(page.rows.every(r => r["issued_by"] === "vendor-a")).toBe(true);
  });
  it("preserves admin precedence for users with both roles", async () => {
    const { db } = database(false, true);
    expect((await readTokenHistoryPage(db, { page: 1, page_size: 20, source: "vendor" })).total).toBe(0);
  });
  it("clamps a stale page to the last available page", async () => {
    const { db } = database();
    const page = await readTokenHistoryPage(db, { page: 99, page_size: 20 });
    expect(page.page).toBe(3);
    expect(page.rows).toHaveLength(5);
  });
  it("returns an empty vendor scope without foreign totals", async () => {
    const { db } = database();
    const page = await readTokenHistoryPage(db, { page: 1, page_size: 20 }, "vendor-c");
    expect(page.rows).toEqual([]);
    expect(page.total).toBe(0);
  });
  it("surfaces a safe error rather than treating failures as empty data", async () => {
    const { db } = database(true);
    await expect(readTokenHistoryPage(db, { page: 1, page_size: 20 })).rejects.toThrow("Could not load token history");
  });
  it("bounds server requests and safely defaults invalid URL values", () => {
    expect(tokenHistoryPageSchema.parse({})).toEqual({ page: 1, page_size: 20 });
    expect(() => tokenHistoryPageSchema.parse({ page: 0 })).toThrow();
    expect(() => tokenHistoryPageSchema.parse({ page_size: 1000 })).toThrow();
    expect(tokenHistorySearch({ page: -1, pageSize: 1000 })).toEqual({ page: 1, pageSize: 20 });
    expect(tokenHistorySearch({ page: "2", pageSize: "50" })).toEqual({ page: 2, pageSize: 50 });
  });
});