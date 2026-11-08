import { describe, expect, it } from "vitest";
import { priceOwnerMeters, runPriceBatches } from "../price-management-data";
import { readPricingRequests, readPricingRelated } from "../price-management-read.server";

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
      { vendor_id: "b", landlord_id: "l", agent_id: null, status: "inactive" },
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