import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { publicMeterSchema, normalizeMeterSearch } from "../meter-search";
import { checkPublicMeter, readCheckedTokens, type createCheckerClient } from "../token-checker.server";

const requestKey = "a".repeat(64);
function database(options: { missing?: boolean; empty?: boolean; fail?: boolean; limited?: boolean } = {}) {
  const tokens = Array.from({ length: 3 }, (_, i) => ({ date: `2026-11-${17-i}T10:00:00Z`, property: "Test Property", unit: "A1", meter: "Ab1234", amount: 206-i, units: 7, token: `token-${6-i}`, status: "issued", reference: `REF-${6-i}`, customer_phone: "private", resident_id: "private" }));
  const rpc = vi.fn(async (_name: string, params: { p_meter_number: string; p_history: boolean }) => ({
    data: options.limited ? { error: "Too many lookups. Please try again in a minute." } : {
      meter: options.missing || params.p_meter_number !== "ab1234" ? null : { meter_number: "Ab1234", type: "electricity", vendor_id: "private" },
      support: { email: "help@example.test", phone: "+254700000000" }, tokens: params.p_history && !options.empty ? tokens : [],
    }, error: options.fail ? new Error("private database failure") : null,
  }));
  return { db: { rpc } as unknown as ReturnType<typeof createCheckerClient>, rpc };
}

describe("Public Token Checker", () => {
  it("normalizes exact meter numbers and rejects wildcards", () => {
    expect(publicMeterSchema.parse({ meter_number: " AB1234 " }).meter_number).toBe(normalizeMeterSearch(" AB1234 "));
    for (const meter_number of ["%123", "ab_123", "ab,123", "a".repeat(65)]) expect(publicMeterSchema.safeParse({ meter_number }).success).toBe(false);
  });
  it("verifies the meter without fetching history or private identifiers", async () => {
    const { db, rpc } = database();
    expect((await checkPublicMeter(db, { meter_number: "AB1234" }, requestKey)).meter).toEqual({ meter_number: "Ab1234", type: "electricity" });
    expect(rpc).toHaveBeenCalledWith("public_token_checker", { p_meter_number: "ab1234", p_request_key: requestKey, p_history: false });
  });
  it("loads three transactions without any resident identity or login", async () => {
    const { db, rpc } = database();
    const rows = await readCheckedTokens(db, { meter_number: " AB1234 " }, requestKey);
    expect(rows).toHaveLength(3);
    expect(rows.map(r => r.amount)).toEqual([206, 205, 204]);
    expect(rpc).toHaveBeenCalledWith("public_token_checker", { p_meter_number: "ab1234", p_request_key: requestKey, p_history: true });
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(["amount", "date", "meter", "property", "reference", "status", "token", "unit", "units"]);
  });
  it("returns unit, property, meter and reference", async () => {
    const rows = await readCheckedTokens(database().db, { meter_number: "AB1234" }, requestKey);
    expect(rows[0]).toMatchObject({ meter: "Ab1234", unit: "A1", property: "Test Property", reference: "REF-6" });
  });
  it("handles a verified meter with no transactions", async () => {
    expect(await readCheckedTokens(database({ empty: true }).db, { meter_number: "AB1234" }, requestKey)).toEqual([]);
  });
  it("rejects unverified meters instead of returning transactions", async () => {
    await expect(readCheckedTokens(database({ missing: true }).db, { meter_number: "AB1234" }, requestKey)).rejects.toThrow("could not be verified");
  });
  it("keeps database failure details private", async () => {
    await expect(readCheckedTokens(database({ fail: true }).db, { meter_number: "AB1234" }, requestKey)).rejects.toThrow("Could not load meter information");
  });
  it("reports lookup throttling without requesting login", async () => {
    await expect(readCheckedTokens(database({ limited: true }).db, { meter_number: "AB1234" }, requestKey)).rejects.toThrow("Too many lookups");
  });
  it("database lookup is canonical-meter scoped and limited to three in timestamp/id order", () => {
    const sql = readFileSync("drizzle/migrations/0068_public_exact_meter_token_checker.sql", "utf8");
    expect(sql).toContain("WHERE mt.meter_id = v_meter.id AND mt.action::text = 'credit'");
    expect(sql).toContain("ORDER BY mt.created_at DESC, mt.id DESC LIMIT 3");
    expect(sql).not.toContain("GRANT SELECT ON public.meter_tokens TO anon");
  });
});
