import { describe, expect, it } from "vitest";
import { publicMeterSchema, normalizeMeterSearch } from "../meter-search";
import { checkPublicMeter, readCheckedTokens } from "../token-checker.server";

function database(options: { foreign?: boolean; missing?: boolean; empty?: boolean; fail?: boolean; inactive?: boolean; future?: boolean } = {}) {
  const calls: string[] = [];
  const tokens = Array.from({ length: 8 }, (_, i) => ({ id: `${i}`, meter_id: i === 7 ? "foreign-meter" : "canonical-meter", action: "credit", created_at: `2026-11-${String(10 + i).padStart(2, "0")}T10:00:00Z`, amount: 200 + i, units: 7, token: `token-${i}`, status: "issued", expires_at: "2099-01-01", customer_phone: "private" }));
  const db = { from(table: string) {
    calls.push(table);
    const filters: ((r: any) => boolean)[] = [];
    const orders: { key: string; ascending: boolean }[] = [];
    let limit = Infinity;
    let rows: any[] = table === "meters" ? (options.missing ? [] : [{ id: "canonical-meter", meter_number: "Ab1234", type: "electricity", unit_id: "unit-a", vendor_id: "secret" }])
      : table === "app_settings" ? [{ key: "app_support_email", value: "help@example.test" }, { key: "app_support_phone", value: "+254700000000" }]
      : table === "users" ? [{ id: "resident-a", status: options.inactive ? "inactive" : "active" }]
      : table === "user_roles" ? [{ user_id: "resident-a", role: "resident" }]
      : table === "unit_assignments" ? [{ user_id: options.foreign ? "resident-b" : "resident-a", unit_id: "unit-a", role: "resident", start_date: options.future ? "2099-01-01" : "2026-11-01", end_date: null }]
      : options.empty ? [] : tokens;
    const result = () => {
      let filtered = rows.filter(r => filters.every(f => f(r)));
      filtered = [...filtered].sort((a, b) => { for (const o of orders) { const diff = String(a[o.key]).localeCompare(String(b[o.key])); if (diff) return o.ascending ? diff : -diff; } return 0; });
      return { data: filtered.slice(0, limit), error: options.fail && table === "meter_tokens" ? new Error("private failure") : null };
    };
    const builder: any = {
      select: () => builder, ilike: (k: string, v: string) => { filters.push(r => r[k].toLowerCase() === v); return builder; },
      eq: (k: string, v: unknown) => { filters.push(r => r[k] === v); return builder; },
      in: (k: string, v: string[]) => { filters.push(r => v.includes(r[k])); return builder; },
      gte: (k: string, v: string) => { filters.push(r => Date.parse(r[k]) >= Date.parse(v)); return builder; },
      lte: (k: string, v: string) => { filters.push(r => r[k] <= v); return builder; },
      lt: (k: string, v: string) => { filters.push(r => Date.parse(r[k]) < Date.parse(v)); return builder; },
      order: (key: string, order: { ascending: boolean }) => { orders.push({ key, ascending: order.ascending }); return builder; },
      limit: (n: number) => { limit = n; return builder; },
      maybeSingle: async () => ({ ...result(), data: result().data[0] ?? null }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return builder;
  } };
  return { db, calls };
}

describe("Token Checker", () => {
  it("shares vendor trimming/case matching and disallows public partial/wildcard input", () => {
    expect(publicMeterSchema.parse({ meter_number: " AB1234 " }).meter_number).toBe(normalizeMeterSearch(" AB1234 "));
    for (const meter_number of ["%123", "ab_123", "ab,123", "a".repeat(65)]) expect(publicMeterSchema.safeParse({ meter_number }).success).toBe(false);
  });
  it("verifies a real exact number without leaking identifiers or fetching history", async () => {
    const { db, calls } = database();
    expect((await checkPublicMeter(db, { meter_number: "AB1234" })).meter).toEqual({ meter_number: "Ab1234", type: "electricity" });
    expect(calls).not.toContain("meter_tokens");
    expect((await checkPublicMeter(db, { meter_number: "1234" })).meter).toBeNull();
  });
  it("returns an unverified meter for no match", async () => {
    expect((await checkPublicMeter(database({ missing: true }).db, { meter_number: "AB1234" })).meter).toBeNull();
  });
  it("uses canonical meter ID and returns only five newest safe records", async () => {
    const rows = await readCheckedTokens(database().db, "resident-a", { meter_number: " AB1234 " });
    expect(rows).toHaveLength(5);
    expect(rows.map(r => r.amount)).toEqual([206, 205, 204, 203, 202]);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(["amount", "date", "status", "token", "units"]);
  });
  it("returns empty history for an authorized meter with no tokens", async () => {
    expect(await readCheckedTokens(database({ empty: true }).db, "resident-a", { meter_number: "AB1234" })).toEqual([]);
  });
  it("denies another resident before token queries", async () => {
    const { db, calls } = database({ foreign: true });
    await expect(readCheckedTokens(db, "resident-a", { meter_number: "AB1234" })).rejects.toThrow("not linked");
    expect(calls).not.toContain("meter_tokens");
  });
  it("denies inactive residents", async () => {
    await expect(readCheckedTokens(database({ inactive: true }).db, "resident-a", { meter_number: "AB1234" })).rejects.toThrow("active resident");
  });
  it("denies future occupancy and never exposes previous occupants' tokens", async () => {
    const { db, calls } = database({ future: true });
    await expect(readCheckedTokens(db, "resident-a", { meter_number: "AB1234" })).rejects.toThrow("not linked");
    expect(calls).not.toContain("meter_tokens");
  });
  it("returns safe retryable history errors", async () => {
    await expect(readCheckedTokens(database({ fail: true }).db, "resident-a", { meter_number: "AB1234" })).rejects.toThrow("Could not load recent tokens");
  });
});