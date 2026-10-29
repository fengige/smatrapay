import { describe, expect, it } from "vitest";
import { paygProgress, paygSchedule } from "../payg-payment";

const plan = { created_at: "2026-10-01T00:00:00.000Z", down_payment_cents: 280000, instalment_cents: 6500, instalment_count: 3, frequency: "daily", total_cents: 299500 };

describe("vendor Pay-as-you-go balance and schedule", () => {
  it("counts only confirmed payments toward the balance", () => {
    const p = paygProgress(plan, [{ status: "completed", amount_cents: 280000 }, { status: "pending", amount_cents: 6500 }, { status: "failed", amount_cents: 6500 }]);
    expect(p.paid_cents).toBe(280000);
    expect(p.remaining_cents).toBe(19500);
  });
  it("never goes below zero remaining", () => {
    expect(paygProgress(plan, [{ status: "completed", amount_cents: 400000 }]).remaining_cents).toBe(0);
  });
  it("allocates confirmed money to down payment then instalments in order", () => {
    const s = paygSchedule(plan, 280000 + 6500 + 3000, new Date("2026-10-01T12:00:00Z"));
    expect(s.map(r => r.status)).toEqual(["paid", "paid", "partial", "upcoming"]);
    expect(s[2]!.paid_cents).toBe(3000);
    expect(s[1]!.due_date).toBe("2026-10-02T00:00:00.000Z");
  });
  it("marks unpaid past instalments overdue", () => {
    const s = paygSchedule(plan, 280000, new Date("2026-10-03T12:00:00Z"));
    expect(s.map(r => r.status)).toEqual(["paid", "overdue", "overdue", "upcoming"]);
  });
  it("monthly due dates advance by calendar month", () => {
    expect(paygSchedule({ ...plan, frequency: "monthly" }, 0)[1]!.due_date).toBe("2026-11-01T00:00:00.000Z");
  });
});
