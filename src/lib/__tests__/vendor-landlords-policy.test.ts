import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const connection = process.env["SUPABASE_DB_URL"];
const sql = connection ? postgres(connection, { max: 1 }) : null;

describe.skipIf(!sql)("vendor-created landlord visibility", () => {
  let predicate = "";

  beforeAll(async () => {
    if (!sql) return;
    const rows = await sql`
      SELECT pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='private' AND p.proname='vendor_created_landlord_ids'
    `;
    const definition = rows[0]?.["definition"];
    if (typeof definition !== "string") throw new Error("Landlord visibility helper missing");
    const match = definition.match(/JOIN public.user_roles r ON ([\s\S]*?)\$function\$/);
    if (!match?.[1]) throw new Error("Landlord visibility predicate missing");
    predicate = match[1];
  });

  afterAll(async () => { await sql?.end(); });

  async function visible(ownerMatches: boolean, isVendor: boolean, isLandlord: boolean, callerMatches = true) {
    if (!sql) throw new Error("Database connection required");
    const expression = predicate
      .replace(/r\.user_id = u\.id/g, "true")
      .replace(/r\.role = 'landlord'::public\.app_role/g, String(isLandlord))
      .replace(/u\.created_by = _vendor/g, String(ownerMatches))
      .replace(/_vendor = auth\.uid\(\)/g, String(callerMatches))
      .replace(/private\.has_role\(auth\.uid\(\), 'vendor'::public\.app_role\)/g, String(isVendor))
      .replace(/\bWHERE\b/, "AND");
    const rows = await sql.unsafe(`SELECT (${expression}) AS visible`);
    const result = rows[0]?.["visible"];
    if (typeof result !== "boolean") throw new Error("Visibility result missing");
    return result;
  }

  it("shows the vendor's created landlord without a unit assignment", async () => {
    expect(await visible(true, true, true)).toBe(true);
  });
  it("hides another vendor's landlord", async () => {
    expect(await visible(false, true, true)).toBe(false);
  });
  it("requires the vendor role", async () => {
    expect(await visible(true, false, true)).toBe(false);
  });
  it("does not expose created staff or resident accounts", async () => {
    expect(await visible(true, true, false)).toBe(false);
  });
  it("rejects requesting another vendor's scope", async () => {
    expect(await visible(true, true, true, false)).toBe(false);
  });
});