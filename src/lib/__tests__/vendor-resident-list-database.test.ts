import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
const connection = process.env["SUPABASE_DB_URL"];
const sql = connection ? postgres(connection, { max: 1, prepare: false }) : null;
describe.skipIf(!sql)("installed vendor resident list rules", () => {
  afterAll(async () => { await sql?.end(); });
  it("includes every created resident, every active scoped occupant, and no unrelated resident", async () => {
    if (!sql) throw new Error("Connection missing");
    const vendors = await sql`SELECT user_id FROM public.user_roles WHERE role='vendor'`;
    expect(vendors.length).toBeGreaterThan(0);
    for (const vendor of vendors) {
      await sql.begin(async tx => {
        await tx`SELECT set_config('request.jwt.claim.sub', ${vendor["user_id"]}, true)`;
        const result = await tx`
          WITH expected AS (
            SELECT DISTINCT u.id FROM public.users u JOIN public.user_roles r ON r.user_id=u.id AND r.role='resident'
            WHERE u.created_by=${vendor["user_id"]}::uuid OR EXISTS (
              SELECT 1 FROM public.unit_assignments a JOIN public.units un ON un.id=a.unit_id JOIN public.properties p ON p.id=un.property_id
              WHERE a.user_id=u.id AND a.role='resident' AND a.end_date IS NULL
              AND (EXISTS (SELECT 1 FROM public.meters m WHERE m.unit_id=un.id AND m.vendor_id=${vendor["user_id"]}::text)
                OR p.zone_id IN (SELECT z.zone_id FROM public.zones z WHERE z.vendor_id=${vendor["user_id"]}::uuid)
                OR p.zone_id IN (SELECT mp.zone_id FROM public.meters m JOIN public.units mu ON mu.id=m.unit_id JOIN public.properties mp ON mp.id=mu.property_id WHERE m.vendor_id=${vendor["user_id"]}::text)
                OR p.created_by=${vendor["user_id"]}::uuid OR (p.owner_type='vendor' AND p.landlord_id=${vendor["user_id"]}::uuid))
            )
          ), actual AS (SELECT user_id AS id FROM public.vendor_resident_list_ids())
          SELECT (SELECT count(*) FROM (SELECT id FROM expected EXCEPT SELECT id FROM actual) missing) AS missing,
                 (SELECT count(*) FROM (SELECT id FROM actual EXCEPT SELECT id FROM expected) extra) AS extra`;
        expect(Number(result[0]?.["missing"])).toBe(0);
        expect(Number(result[0]?.["extra"])).toBe(0);
      });
    }
  });
  it("denies anonymous execution", async () => {
    if (!sql) throw new Error("Connection missing");
    const rows = await sql`SELECT has_function_privilege('anon','public.vendor_resident_list_ids()','EXECUTE') AS allowed`;
    expect(rows[0]?.["allowed"]).toBe(false);
  });
});