import { describe, expect, it } from "vitest";
import { readPriceMeters } from "../price-meter-scope.server";

function database(meters: any[], linked: string[] = [], allowed = true) {
  const requests: any[] = [];
  function query(table: string, rows: any[]) {
    let result = rows;
    const q: any = {
      select: () => q,
      eq: (key: string, value: string) => { requests.push([table, key, value]); result = result.filter(r => r[key] === value); return q; },
      in: (key: string, values: string[]) => { result = result.filter(r => values.includes(r[key])); return q; },
      is: () => q,
      order: () => q,
      range: async (start: number, end: number) => ({ data: result.slice(start, end + 1), error: null }),
    };
    return q;
  }
  return { requests, db: {
    from: (table: string) => query(table, table === "meters" ? meters : []),
    rpc: (name: string) => name === "has_role" ? Promise.resolve({ data: allowed, error: null }) : query(name, linked),
  } };
}

describe("complete portal price meter scope", () => {
  it("includes every vendor meter beyond 1,000 regardless of software, assignment or activity", async () => {
    const own = Array.from({ length: 5000 }, (_, id) => ({ id: String(id), vendor_id: "own", type: ["Electricity", "Water", "Gas"][id % 3], status: id % 2 ? "active" : "inactive", vending_software_id: id % 2 ? "software" : null }));
    const { db, requests } = database([...own, { id: "foreign", vendor_id: "other" }]);
    const rows = await readPriceMeters(db, "vendor", "own");
    expect(rows.length).toBe(5000);
    expect(rows.filter(r => r.type === "Electricity").length).toBe(1667);
    expect(rows.filter(r => r.type === "Water").length).toBe(1667);
    expect(rows.filter(r => r.type === "Gas").length).toBe(1666);
    expect(requests).toEqual(Array.from({ length: 11 }, () => ["meters", "vendor_id", "own"]));
  });
  it("includes landlord-linked meters across vendors and excludes foreign meters", async () => {
    const meters = Array.from({ length: 1201 }, (_, id) => ({ id: String(id), vendor_id: id % 2 ? "a" : "b", type: "Water" }));
    const { db } = database([...meters, { id: "foreign" }], meters.map(m => m.id));
    const rows = await readPriceMeters(db, "landlord", "landlord");
    expect(rows.length).toBe(1201);
    expect(rows.some(r => r.id === "foreign")).toBe(false);
  });
  it("re-reads the authoritative meter set after creation and reassignment", async () => {
    const meters = [{ id: "first", vendor_id: "own" }];
    const { db } = database(meters);
    expect((await readPriceMeters(db, "vendor", "own")).length).toBe(1);
    meters.push({ id: "new", vendor_id: "own" });
    expect((await readPriceMeters(db, "vendor", "own")).length).toBe(2);
    const first = meters[0];
    if (!first) throw new Error("Missing test meter");
    first.vendor_id = "other";
    expect((await readPriceMeters(db, "vendor", "own")).length).toBe(1);
  });
  it("denies callers without the required portal role", async () => {
    await expect(readPriceMeters(database([], [], false).db, "landlord", "foreign")).rejects.toThrow("Landlord access required");
  });
});