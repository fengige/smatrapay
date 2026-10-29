import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
const connection = process.env["SUPABASE_DB_URL"];
const sql = connection ? postgres(connection, { max: 1 }) : null;
afterAll(async () => { await sql?.end(); });
describe.skipIf(!sql)("installed Pay-as-you-go approval enforcement", () => {
  let predicate = "";
  beforeAll(async () => {
    if (!sql) return;
    const rows = await sql`SELECT prosrc FROM pg_proc WHERE proname='guard_payg_charge_approval'`;
    const body = String(rows[0]?.["prosrc"] ?? "");
    const where = body.match(/WHERE ([\s\S]+?)\) THEN/);
    if (!where?.[1]) throw new Error("Installed charge guard missing");
    predicate = where[1].replaceAll("NEW.", "n.");
  });
  async function allowed(productStatus = "approved", applicationStatus = "approved", owner = "vendor-a", environment = "production") {
    if (!sql) throw new Error("Database required");
    const rows = await sql.unsafe(`SELECT (${predicate}) AS allowed FROM
      (SELECT 'plan' AS id,'resident' AS resident_id,'vendor-a' AS vendor_id) p,
      (SELECT $1::text AS status) a,
      (SELECT $2::text AS approval_status,true AS is_active,NULL::timestamptz AS deleted_at) pr,
      (SELECT $3::text AS owner_id,true AS enabled,true AS stk_enabled,$4::text AS environment,'KE' AS country,'KES' AS currency) c,
      (SELECT 'plan' AS plan_id,'resident' AS resident_id) n`, [applicationStatus,productStatus,owner,environment]);
    return rows[0]?.["allowed"];
  }
  it("requires approved products even for an existing plan", async () => { expect(await allowed()).toBe(true); expect(await allowed("pending")).toBe(false); expect(await allowed("declined")).toBe(false); });
  it("requires approved applications before inserting payment attempts", async () => { expect(await allowed("approved","pending")).toBe(false); expect(await allowed("approved","declined")).toBe(false); });
  it("rejects platform, cross-vendor and sandbox receiving accounts", async () => { expect(await allowed("approved","approved","platform")).toBe(false); expect(await allowed("approved","approved","vendor-b")).toBe(false); expect(await allowed("approved","approved","vendor-a","sandbox")).toBe(false); });
});