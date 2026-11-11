import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const connection = process.env["SUPABASE_DB_URL"];
const sql = connection ? postgres(connection, { max: 1 }) : null;
describe.skipIf(!sql)("installed landlord assignment eligibility", () => {
  afterAll(async () => { await sql?.end(); });
  async function eligible(actor: string, target: string) {
    if (!sql) throw new Error("Database connection required");
    return sql.begin(async (tx) => {
      await tx`SELECT set_config('request.jwt.claim.sub', ${actor}, true)`;
      const rows = await tx`SELECT public.is_landlord_account(${target}::uuid) AS allowed`;
      return rows[0]?.["allowed"];
    });
  }
  it("allows Jubilee Utilities to validate Samburu Heights' landlord role", async () => {
    expect(await eligible("294d9f0f-c2ff-43c8-8d42-a29b07bdbd90", "0f11e707-ab64-48e0-83c6-c072c70b5bcf")).toBe(true);
  });
  it("does not treat the vendor itself as a landlord", async () => {
    expect(await eligible("294d9f0f-c2ff-43c8-8d42-a29b07bdbd90", "294d9f0f-c2ff-43c8-8d42-a29b07bdbd90")).toBe(false);
  });
  it("blocks landlord-only callers from checking other accounts", async () => {
    expect(await eligible("0f11e707-ab64-48e0-83c6-c072c70b5bcf", "0f11e707-ab64-48e0-83c6-c072c70b5bcf")).toBe(false);
  });
  it("does not grant anonymous eligibility access", async () => {
    if (!sql) throw new Error("Database connection required");
    const rows = await sql`SELECT has_function_privilege('anon','public.is_landlord_account(uuid)','EXECUTE') AS allowed`;
    expect(rows[0]?.["allowed"]).toBe(false);
  });
});