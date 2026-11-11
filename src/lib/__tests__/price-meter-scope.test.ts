import { describe, expect, it } from "vitest";
import { readPriceMeters } from "../price-meter-scope.server";

function database(meters: any[], linked: string[] = [], allowed = true, tables: Record<string, any[]> = {}, commissions: any[] = []) {
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
    from: (table: string) => query(table, table === "meters" ? meters : tables[table] ?? []),
    rpc: (name: string) => name === "has_role" ? Promise.resolve({ data: allowed, error: null }) : query(name, name === "vendor_price_commissions" ? commissions : linked),
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
  it("uses the actual unit name instead of the assigned resident name", async () => {
    const { db } = database([{ id: "m", vendor_id: "own", unit_id: "u" }], [], true, {
      units: [{ id: "u", unit_number: "Apartment A7", property_id: "p" }],
      properties: [{ id: "p", name: "Court" }],
      unit_assignments: [{ id: "a", unit_id: "u", user_id: "r", role: "resident" }],
      users: [{ id: "r", name: "Resident Person" }],
    });
    expect((await readPriceMeters(db, "vendor", "own"))[0]).toMatchObject({ unit_name: "Apartment A7", resident_name: "Resident Person" });
  });
  it("maps all three persisted commission values by meter without leaking foreign meters", async () => {
    const { db } = database([{ id: "a", vendor_id: "own" }, { id: "b", vendor_id: "own" }, { id: "foreign", vendor_id: "other" }], [], true, {}, [
      { meter_id: "a", commission_payer: "owner", commission_percentage: "4.25", vat_on_commission_percentage: "10.50" },
      { meter_id: "b", commission_payer: "resident", commission_percentage: "7.00", vat_on_commission_percentage: "16.00" },
    ]);
    const rows = await readPriceMeters(db, "vendor", "own");
    expect(rows.map(r => r.id)).toEqual(["a", "b"]);
    expect(rows.map(r => r.owner_commission)).toEqual([
      { commission_payer: "owner", commission_percentage: 4.25, vat_on_commission_percentage: 10.5 },
      { commission_payer: "resident", commission_percentage: 7, vat_on_commission_percentage: 16 },
    ]);
  });
  it("returns missing configuration explicitly and reads saved changes on refetch", async () => {
    const saved: any[] = [];
    const { db } = database([{ id: "m", vendor_id: "own", commission_percentage: 99 }], [], true, {}, saved);
    expect((await readPriceMeters(db, "vendor", "own"))[0]?.owner_commission).toBeNull();
    saved.push({ meter_id: "m", commission_payer: "resident", commission_percentage: "0", vat_on_commission_percentage: "16" });
    expect((await readPriceMeters(db, "vendor", "own"))[0]?.owner_commission).toEqual({ commission_payer: "resident", commission_percentage: 0, vat_on_commission_percentage: 16 });
    saved[0].commission_payer = "owner"; saved[0].commission_percentage = "8.25";
    expect((await readPriceMeters(db, "vendor", "own"))[0]?.owner_commission).toEqual({ commission_payer: "owner", commission_percentage: 8.25, vat_on_commission_percentage: 16 });
  });
});