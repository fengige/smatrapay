import { beforeAll, afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
const connection = process.env["SUPABASE_DB_URL"];
const sql = connection ? postgres(connection, { max: 1, prepare: false }) : null;
describe.skipIf(!sql)("installed bulk assignment authorization", () => {
  let definition = "";
  beforeAll(async () => {
    if (!sql) return;
    const rows = await sql`SELECT pg_get_functiondef('public.import_meter_unit_assignment(text,uuid,uuid,uuid,uuid,text)'::regprocedure) AS definition`;
    definition = String(rows[0]?.["definition"] ?? "");
  });
  afterAll(async () => { await sql?.end(); });
  it("denies anonymous calls and allows authenticated execution", async () => {
    if (!sql) throw new Error("Connection missing");
    for (const fn of ["public.import_meter_unit_assignment(text,uuid,uuid,uuid,uuid,text)", "public.meter_assignment_csv_references(text)"]) {
      const rows = await sql`SELECT has_function_privilege('anon',${fn},'EXECUTE') AS anon, has_function_privilege('authenticated',${fn},'EXECUTE') AS authed`;
      expect(rows[0]?.["anon"]).toBe(false); expect(rows[0]?.["authed"]).toBe(true);
    }
  });
  it("rejects foreign and null vendor meter ownership using installed guard", async () => {
    if (!sql) throw new Error("Connection missing");
    const match = definition.match(/p_portal='vendor' AND (m\.vendor_id IS DISTINCT FROM actor::text)/);
    if (!match?.[1]) throw new Error("Ownership guard missing");
    const expression = match[1].replace("m.vendor_id", "$1::text").replace("actor::text", "$2::text");
    for (const owner of [null, "vendor-b", "vendor-a"]) {
      const rows = await sql.unsafe(`SELECT ${expression} AS denied`, [owner, "vendor-a"]);
      expect(rows[0]?.["denied"]).toBe(owner !== "vendor-a");
    }
  });
  it("fails closed on null ownership when no property relationship exists", async () => {
    if (!sql) throw new Error("Connection missing");
    const match = definition.match(/p_portal='vendor' AND NOT (coalesce\(\(p\.created_by=actor[\s\S]*?\),false\))/);
    if (!match?.[1]) throw new Error("Property guard missing");
    const expression = match[1].replace(/EXISTS\(SELECT 1 FROM private\.vendor_scope_property_ids\(actor\) s WHERE s\.property_id=p\.id\)/,"false").replaceAll("p.created_by", "$1::uuid").replaceAll("p.landlord_id", "$2::uuid").replaceAll("p.owner_type", "$3::text").replaceAll("actor", "$4::uuid");
    const rows = await sql.unsafe(`SELECT NOT ${expression} AS denied`, [null, null, null, "00000000-0000-0000-0000-000000000001"]);
    expect(rows[0]?.["denied"]).toBe(true);
  });
});