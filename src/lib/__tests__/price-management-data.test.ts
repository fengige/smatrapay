import { describe, expect, it } from "vitest";
import { matchesPriceProperty, matchesPriceVendor, priceOwnerMeters, pricePropertyOptions, runPriceBatches } from "../price-management-data";
import { readPricingRequests, readPricingRelated, readPricingMeterRegistry } from "../price-management-read.server";

function database(rows: any[]) {
  const calls: number[] = [];
  return { calls, from: () => {
    let filtered = rows;
    const q: any = {
      select: () => q, order: () => q,
      eq: (key: string, value: string) => { filtered = filtered.filter(r => r[key] === value); return q; },
      in: (key: string, ids: string[]) => { calls.push(ids.length); filtered = filtered.filter(r => ids.includes(r[key])); return q; },
      range: async (start: number, end: number) => ({ data: filtered.slice(start, end + 1), error: null }),
    };
    return q;
  } };
}

describe("complete pricing and approvals", () => {
  it("includes all vendors by default and combines a specific vendor with property filtering", () => {
    const meters = [
      { vendor_id: "a", property_id: "p1" },
      { vendor_id: "a", property_id: "p2" },
      { vendor_id: "b", property_id: "p1" },
    ];
    expect(meters.filter(m => matchesPriceVendor(m, "all")).length).toBe(3);
    expect(meters.filter(m => matchesPriceVendor(m, "a")).length).toBe(2);
    expect(meters.filter(m => matchesPriceVendor(m, "a") && matchesPriceProperty(m, "p1"))).toEqual([meters[0]]);
    expect(meters.filter(m => matchesPriceVendor(m, "missing"))).toEqual([]);
  });
  it("includes all properties by default and filters specific properties by ID, not duplicate names", () => {
    const meters = [
      { property_id: "a", property_name: "Same name", type: "water" },
      { property_id: "b", property_name: "Same name", type: "gas" },
      { property_id: "a", property_name: "Same name", type: "gas" },
      { property_id: null, property_name: null, type: "water" },
    ];
    expect(meters.filter(m => matchesPriceProperty(m, "all")).length).toBe(4);
    expect(meters.filter(m => matchesPriceProperty(m, "a")).length).toBe(2);
    expect(meters.filter(m => matchesPriceProperty(m, "a") && m.type === "gas").length).toBe(1);
    expect(meters.filter(m => matchesPriceProperty(m, "none")).length).toBe(1);
    expect(pricePropertyOptions(meters)).toEqual([{ id: "a", name: "Same name" }, { id: "b", name: "Same name" }]);
  });
  it("loads all 5,000 administrator meters including inactive and unassigned meters", async () => {
    const rows = Array.from({ length: 5000 }, (_, i) => ({ id: String(i), status: i % 2 ? "active" : "inactive", unit_id: null }));
    const result = await readPricingMeterRegistry(database(rows), "id,status,unit_id");
    expect(result.length).toBe(5000);
    expect(result.filter(r => r.status === "inactive").length).toBe(2500);
  });
  it("keeps the system registry complete across all ownership, status and utility types while filters only select matches", async () => {
    const source = Array.from({ length: 5004 }, (_, i) => ({
      id: String(i), type: ["Electricity", "Water", "Gas", "Multi-Utility"][i % 4],
      vendor_id: i % 2 ? "a" : "b", landlord_id: i % 3 ? null : "l",
      agent_id: i % 5 ? null : "agent", unit_id: null,
      status: i % 2 ? "active" : "inactive",
    }));
    const all = await readPricingMeterRegistry(database(source), "id,type,vendor_id,landlord_id,agent_id,status");
    const matches = priceOwnerMeters(all, "landlord", "l").filter(m => matchesPriceVendor(m, "a"));
    expect(matches.length).toBe(834);
    expect(all.length).toBe(5004);
    expect(all.filter(m => m.type === "Electricity").length).toBe(1251);
    expect(all.filter(m => m.type === "Water").length).toBe(1251);
    expect(all.filter(m => m.type === "Gas").length).toBe(1251);
    expect(all.filter(m => m.type === "Multi-Utility").length).toBe(1251);
  });
  it("refreshes the complete registry after creation, bulk import and assignment updates", async () => {
    const source = [{ id: "first", vendor_id: "a" }];
    const db = database(source);
    expect((await readPricingMeterRegistry(db, "id,vendor_id")).length).toBe(1);
    source.push(...Array.from({ length: 1200 }, (_, i) => ({ id: `import-${i}`, vendor_id: "b" })));
    expect((await readPricingMeterRegistry(db, "id,vendor_id")).length).toBe(1201);
    const first = source[0];
    if (!first) throw new Error("Missing initial meter");
    first.vendor_id = "b";
    const updated = await readPricingMeterRegistry(db, "id,vendor_id");
    expect(updated.length).toBe(1201);
    expect(updated.find(m => m.id === "first")?.vendor_id).toBe("b");
  });
  it("returns all 5,000 approval requests instead of only 300 or 1,000", async () => {
    const rows = Array.from({ length: 5000 }, (_, i) => ({ id: String(i), status: "pending", vendor_id: "own" }));
    expect((await readPricingRequests(database(rows))).length).toBe(5000);
  });
  it("keeps vendor approval counts isolated beyond 200 requests", async () => {
    const rows = Array.from({ length: 1201 }, (_, i) => ({ id: String(i), vendor_id: "own" }));
    const result = await readPricingRequests(database([...rows, { id: "foreign", vendor_id: "other" }]), "own");
    expect(result.length).toBe(1201);
    expect(result.some(r => r.id === "foreign")).toBe(false);
  });
  it("resolves every meter and owner beyond 1,000 with bounded lookups", async () => {
    const rows = Array.from({ length: 5000 }, (_, i) => ({ id: String(i) }));
    const db = database(rows);
    expect((await readPricingRelated(db, "meters", "id", rows.map(r => r.id))).length).toBe(5000);
    expect(Math.max(...db.calls)).toBe(200);
  });
  it("counts all owner meters including inactive and cross-vendor landlord meters", () => {
    const rows = [
      { vendor_id: "a", landlord_id: "l", agent_id: null, status: "active" },
      { vendor_id: "b", landlord_id: null, property_landlord_id: "l", agent_id: null, status: "inactive" },
      { vendor_id: "a", landlord_id: "other", agent_id: null, status: "active" },
    ];
    expect(priceOwnerMeters(rows, "landlord", "l").length).toBe(2);
    expect(priceOwnerMeters(rows, "vendor", "a").length).toBe(2);
  });
  it("reviews all 5,000 selected requests in batches no larger than 500", async () => {
    const ids = Array.from({ length: 5000 }, (_, i) => String(i));
    let count = 0;
    const sizes: number[] = [];
    await runPriceBatches(ids, async batch => { sizes.push(batch.length); return batch.length; }, n => { count += n; });
    expect(count).toBe(5000);
    expect(sizes).toEqual(Array(10).fill(500));
  });
  it("stops on failure without marking the failing or unprocessed batches complete", async () => {
    let count = 0;
    await expect(runPriceBatches(Array.from({ length: 1200 }, (_, i) => String(i)), async batch => {
      if (batch[0] === "500") throw new Error("Failed");
      return batch.length;
    }, n => { count += n; })).rejects.toThrow("Failed");
    expect(count).toBe(500);
  });
});