import { describe, expect, it, vi } from "vitest";
import { readResidentPaygApplicationDetail } from "../resident-payg-applications.server";

function database(owner = "resident-a", failHistory = false) {
  const filters: { table: string; column: string; value: unknown }[] = [];
  const db = { from: vi.fn((table: string) => {
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => { filters.push({ table, column, value }); return builder; },
      in: (column: string, value: unknown) => { filters.push({ table, column, value }); return builder; },
      maybeSingle: async () => ({ data: { id: "app-a", resident_id: owner, status: "approved" }, error: null }),
      order: async () => table === "payg_plans" ? { data: [
        { id: "plan-a", application_id: "app-a", created_at: "2026-10-01T00:00:00Z", product_id: "product", down_payment_cents: 280000, instalment_cents: 6500, instalment_count: 3, frequency: "daily", total_cents: 299500 },
        { id: "other-app-plan", application_id: "app-b", created_at: "2026-10-01T00:00:00Z", product_id: "product", down_payment_cents: 280000, instalment_cents: 6500, instalment_count: 3, frequency: "daily", total_cents: 299500 },
      ], error: null } : table === "payg_payment_attempts" ? { data: [
        { id: "confirmed", plan_id: "plan-a", amount_cents: 286500, status: "completed" },
        { id: "pending", plan_id: "plan-a", amount_cents: 6500, status: "pending" },
        { id: "uncertain", plan_id: "plan-a", amount_cents: 6500, status: "uncertain" },
        { id: "foreign", plan_id: "foreign-plan", amount_cents: 100000, status: "completed" },
      ], error: null } : { data: [{ action: "vendor_approved", note: "Approved", created_at: "2026-10-01" }], error: failHistory },
    };
    return builder;
  }) };
  return { db, filters };
}

describe("resident application detail access and shared progress", () => {
  it("filters application, plans and attempts by the session resident", async () => {
    const { db, filters } = database();
    await readResidentPaygApplicationDetail(db, db, "resident-a", "app-a");
    for (const table of ["payg_applications", "payg_plans", "payg_payment_attempts"]) {
      expect(filters).toContainEqual({ table, column: "resident_id", value: "resident-a" });
    }
    expect(filters).toContainEqual({ table: "payg_review_events", column: "entity_id", value: "app-a" });
  });
  it("denies another resident's application before reading plans or history", async () => {
    const { db } = database("resident-b");
    await expect(readResidentPaygApplicationDetail(db, db, "resident-a", "app-b")).rejects.toThrow("Application not found");
    expect(db.from.mock.calls.map(c => c[0])).toEqual(["payg_applications"]);
  });
  it("links the exact application and shares confirmed-only schedule allocation", async () => {
    const { db } = database();
    const detail = await readResidentPaygApplicationDetail(db, db, "resident-a", "app-a");
    expect(detail.plan?.id).toBe("plan-a");
    expect(detail.plan?.paid_cents).toBe(286500);
    expect(detail.plan?.remaining_cents).toBe(13000);
    expect(detail.plan?.instalments_paid).toBe(1);
    expect(detail.plan?.pending).toBe(true);
    expect(detail.plan?.schedule.map(s => s.paid_cents)).toEqual([280000, 6500, 0, 0]);
    expect(detail.plan?.schedule[1]?.due_date).toBe("2026-10-02T00:00:00.000Z");
  });
  it("does not hide a history read failure", async () => {
    const { db } = database("resident-a", true);
    await expect(readResidentPaygApplicationDetail(db, db, "resident-a", "app-a")).rejects.toThrow("Could not load application history");
  });
});