import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
const connection = process.env["SUPABASE_DB_URL"];
const sql = connection ? postgres(connection, { max: 1 }) : null;
const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
describe.skipIf(!sql)("installed Pay-as-you-go summary policies", () => {
  let policies: Record<string, { qual: string | null; with_check: string | null }> = {};
  beforeAll(async () => {
    if (!sql) return;
    const rows = await sql`SELECT policyname,qual,with_check FROM pg_policies
      WHERE schemaname='public' AND tablename='payg_service_summaries'`;
    policies = Object.fromEntries(rows.map(r => [r["policyname"], { qual: r["qual"], with_check: r["with_check"] }]));
  });
  afterAll(async () => { await sql?.end(); });
  async function allows(name: string, field: "qual" | "with_check", owner: string, vendor = true) {
    if (!sql) throw new Error("Database required");
    const policy = policies[name]?.[field];
    if (!policy) throw new Error("Required policy missing");
    const expression = policy.replace(/(?:public\.)?has_role\(auth\.uid\(\), 'vendor'::(?:public\.)?app_role\)/g, String(vendor))
      .replace(/auth\.uid\(\)/g, "$1::uuid");
    const rows = await sql.unsafe(`SELECT (${expression}) AS allowed FROM (SELECT $2::uuid AS vendor_id) r`, [a,owner]);
    return rows[0]?.["allowed"];
  }
  it("vendor A reads only its own row", async () => {
    expect(await allows("Vendors read own payg summary","qual",a)).toBe(true);
    expect(await allows("Vendors read own payg summary","qual",b)).toBe(false);
  });
  it("insert binds ownership to the session vendor", async () => {
    expect(await allows("Vendors insert own payg summary","with_check",a)).toBe(true);
    expect(await allows("Vendors insert own payg summary","with_check",b)).toBe(false);
  });
  it("updates cannot target another vendor or transfer ownership", async () => {
    expect(await allows("Vendors update own payg summary","qual",b)).toBe(false);
    expect(await allows("Vendors update own payg summary","with_check",b)).toBe(false);
  });
  it("residents cannot use vendor write policies", async () => {
    expect(await allows("Vendors insert own payg summary","with_check",a,false)).toBe(false);
    expect(await allows("Vendors update own payg summary","qual",a,false)).toBe(false);
  });
});