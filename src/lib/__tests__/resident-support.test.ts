import { describe, expect, it, vi } from "vitest";
import { readResidentPaygPlans } from "../payg-plans.server";
import { paygSupportFacts } from "../resident-support";

function database(planError = false, paymentError = false) {
  const queries: { table: string; filters: [string, unknown][] }[] = [];
  const db = { from: vi.fn((table: string) => {
    const filters: [string, unknown][] = [];
    queries.push({ table, filters });
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => { filters.push([column, value]); return builder; }),
      in: vi.fn((column: string, value: unknown) => { filters.push([column, value]); return builder; }),
      order: vi.fn(async () => table === "payg_plans"
        ? { error: planError, data: [{ id: "own-plan", product_id: "product", product_name: "HomePlus Max", down_payment_cents: 280000, instalment_cents: 6500, instalment_count: 480, frequency: "daily", total_cents: 3400000 }] }
        : { error: paymentError, data: [
          { id: "down", plan_id: "own-plan", amount_cents: 280000, status: "completed", receipt: "PRIVATE", error_message: "PRIVATE", created_at: "2026-10-28" },
          { id: "paid", plan_id: "own-plan", amount_cents: 6500, status: "completed", created_at: "2026-10-28" },
          { id: "pending", plan_id: "own-plan", amount_cents: 6500, status: "pending", created_at: "2026-10-28" },
          { id: "foreign", plan_id: "foreign-plan", amount_cents: 100000, status: "completed" },
        ] }),
    };
    return builder;
  }) };
  return { db, queries };
}

describe("resident support Pay-as-you-go facts", () => {
  it("binds both plan and payment reads to the resident and selected plan ids", async () => {
    const { db, queries } = database();
    await readResidentPaygPlans(db, "resident-a");
    expect(queries).toEqual([
      { table: "payg_plans", filters: [["resident_id", "resident-a"]] },
      { table: "payg_payment_attempts", filters: [["resident_id", "resident-a"], ["plan_id", ["own-plan"]]] },
    ]);
  });
  it("shares exact confirmed progress with chat and excludes pending and foreign payments", async () => {
    const { db } = database();
    const facts = paygSupportFacts(await readResidentPaygPlans(db, "resident-a"));
    expect(facts[0]).toMatchObject({ down_payment_cents: 280000, instalment_cents: 6500,
      instalment_count: 480, total_cents: 3400000, confirmed_paid_cents: 286500,
      remaining_cents: 3113500, instalments_paid: 1, next_payment_cents: 6500,
      payment_needs_confirmation: true });
    expect(facts[0]?.recent_payments).toHaveLength(3);
  });
  it("never includes internal ids, receipts or raw payment errors in AI facts", async () => {
    const { db } = database();
    const text = JSON.stringify(paygSupportFacts(await readResidentPaygPlans(db, "resident-a")));
    expect(text).not.toContain("PRIVATE");
    expect(text).not.toContain("own-plan");
    expect(text).not.toContain("product_id");
    expect(text).not.toContain("error_message");
  });
  it("represents no purchased plans as an empty list", () => {
    expect(paygSupportFacts([])).toEqual([]);
  });
  it.each([[true, false], [false, true]])("fails closed when account reads fail (%s, %s)", async (planError, paymentError) => {
    const { db } = database(planError, paymentError);
    await expect(readResidentPaygPlans(db, "resident-a")).rejects.toThrow();
  });
});