import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
const connection = process.env["SUPABASE_DB_URL"];
const sql = connection ? postgres(connection, { max: 1, prepare: false }) : null;
describe.skipIf(!sql)("installed vendor resident list rules", () => {
  afterAll(async () => { await sql?.end(); });
  it("evaluates installed creator and active-assignment conditions", async () => {
    if (!sql) throw new Error("Connection missing");
    const definitions = await sql`SELECT pg_get_functiondef('public.vendor_resident_list_ids()'::regprocedure) AS definition`;
    const definition = String(definitions[0]?.["definition"] ?? "");
    const predicate = definition.match(/u\.created_by=auth\.uid\(\)/)?.[0];
    if (!predicate) throw new Error("Creator visibility predicate missing");
    for (const creator of ["00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002", null]) {
      const result = await sql.unsafe(`SELECT coalesce(${predicate.replace("u.created_by", "$1::uuid").replace("auth.uid()", "$2::uuid")},false) AS visible`, [creator, "00000000-0000-0000-0000-000000000001"]);
      expect(result[0]?.["visible"]).toBe(creator === "00000000-0000-0000-0000-000000000001");
    }
    const active = definition.match(/a\.end_date IS NULL/)?.[0];
    if (!active) throw new Error("Active assignment predicate missing");
    for (const end of [null, "2026-11-06"]) {
      const result = await sql.unsafe(`SELECT ${active.replace("a.end_date", "$1::text")} AS active`, [end]);
      expect(result[0]?.["active"]).toBe(end === null);
    }
  });
  it("denies anonymous execution", async () => {
    if (!sql) throw new Error("Connection missing");
    const rows = await sql`SELECT has_function_privilege('anon','public.vendor_resident_list_ids()','EXECUTE') AS allowed`;
    expect(rows[0]?.["allowed"]).toBe(false);
  });
});