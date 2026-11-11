import { describe, expect, it } from "vitest";
import { loadVendorScope } from "../vendor.server";

function query(rows: any[], error: { message: string } | null = null) {
  const q: any = {
    select: () => q,
    eq: () => q,
    in: () => q,
    order: () => q,
    range: async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error }),
  };
  return q;
}

function meterRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `meter-${i}`,
    meter_number: `M${i}`,
    serial_number: null,
    type: "electricity",
    status: i % 2 === 0 ? "active" : "inactive",
    installation_status: "installed",
    installation_date: null,
    installer: null,
    installation_location: null,
    installation_notes: null,
    supplier_id: null,
    vending_software_id: null,
    unit_id: null,
    price_per_unit: 10,
    commission_percentage: null,
    vat_on_commission_percentage: null,
    initial_reading: 0,
    sgc: null,
    krn: null,
    ti: null,
    ea: null,
    ken: null,
    created_at: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`,
    updated_at: null,
  }));
}

describe("vendor scope meters", () => {
  it("loads every assigned meter beyond the 1000-row default limit", async () => {
    const rows = meterRows(1200);
    const db = { from: (table: string) => (table === "meters" ? query(rows) : query([])) };
    const scope = await loadVendorScope(db as never, "vendor-1");
    expect(scope.meters).toHaveLength(1200);
    expect(scope.meters.some((m) => m.id === "meter-1199")).toBe(true);
    expect(scope.meters.filter((m) => m.status === "active")).toHaveLength(600);
  });

  it("never silently returns a partial meter list on read failure", async () => {
    const db = { from: () => query(null as never, { message: "read failed" }) };
    await expect(loadVendorScope(db as never, "vendor-1")).rejects.toThrow("read failed");
  });
});
