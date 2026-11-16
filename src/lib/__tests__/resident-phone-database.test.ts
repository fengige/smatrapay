import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const connection = process.env["SUPABASE_DB_URL"];
const sql = connection ? postgres(connection, { max: 1 }) : null;
const resident = "11111111-1111-4111-8111-111111111111";
const challenge = "22222222-2222-4222-8222-222222222222";
const hash = "a".repeat(64);

describe.skipIf(!sql)("installed resident phone verification", () => {
  afterAll(async () => { await sql?.end(); });
  async function check(mode: string) {
    if (!sql) throw new Error("Database required");
    return sql.begin(async tx => {
      await tx.unsafe("CREATE TEMP TABLE fixture_challenges (LIKE public.resident_phone_challenges INCLUDING DEFAULTS) ON COMMIT DROP");
      await tx.unsafe(`CREATE OR REPLACE FUNCTION pg_temp.fixture_matches(p_phone text) RETURNS TABLE(id uuid,phone text) LANGUAGE sql AS $$ SELECT '${resident}'::uuid,'+254712345678'::text WHERE ${mode === "inactive" ? "false" : "true"} $$`);
      const definitions = await tx`select pg_get_functiondef('public.consume_resident_phone_challenge(uuid,text)'::regprocedure) definition`;
      const definition = String(definitions[0]?.["definition"]).replace("public.consume_resident_phone_challenge", "pg_temp.fixture_consume").replaceAll("public.resident_phone_challenges", "pg_temp.fixture_challenges").replaceAll("public.find_resident_phone_account", "pg_temp.fixture_matches");
      await tx.unsafe(definition);
      await tx.unsafe(`INSERT INTO pg_temp.fixture_challenges(id,resident_id,phone,code_hash,expires_at,delivered) VALUES('${challenge}','${resident}','+254712345678','${hash}',now()+interval '${mode === "expired" ? "-1" : "300"} seconds',${mode !== "undelivered"})`);
      const consume = async (codeHash = hash) => (await tx.unsafe(`select pg_temp.fixture_consume('${challenge}','${codeHash}') result`))[0]?.["result"];
      if (mode === "attempts") { for (let i = 0; i < 5; i++) expect(await consume("b".repeat(64))).toBeNull(); }
      if (mode === "reused") expect(await consume()).toBe(resident);
      if (mode === "concurrent") {
        const results = await Promise.all([consume(), consume()]);
        return results.filter(Boolean).length;
      }
      return consume(mode === "incorrect" ? "b".repeat(64) : hash);
    });
  }
  it("accepts an eligible delivered code", async () => expect(await check("success")).toBe(resident));
  it.each(["incorrect", "expired", "reused", "attempts", "inactive", "undelivered"])("rejects %s using the installed atomic algorithm", async mode => expect(await check(mode)).toBeNull());
  it("only permits one consumption when verification is repeated together", async () => expect(await check("concurrent")).toBe(1));
  it("normalizes Kenya formats consistently in the database", async () => {
    if (!sql) throw new Error("Database required");
    for (const phone of ["0712345678", "712345678", "+254712345678", "00254712345678"]) {
      const rows = await sql`select public.normalize_resident_phone(${phone}) result`;
      expect(rows[0]?.["result"]).toBe("+254712345678");
    }
  });
  it("never grants anonymous or authenticated browser access to OTP secrets or verification RPCs", async () => {
    if (!sql) throw new Error("Database required");
    const rows = await sql`select has_table_privilege('anon','public.resident_phone_challenges','SELECT') anon_read,has_table_privilege('authenticated','public.resident_phone_challenges','SELECT') signed_read,has_function_privilege('anon','public.consume_resident_phone_challenge(uuid,text)','EXECUTE') anon_verify`;
    expect(rows[0]).toMatchObject({ anon_read: false, signed_read: false, anon_verify: false });
  });
});