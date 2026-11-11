import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const connection = process.env["SUPABASE_DB_URL"];
const sql = connection ? postgres(connection, { max: 1 }) : null;

describe.skipIf(!sql)("installed vendor pricing commission scope", () => {
  let body = "";
  beforeAll(async () => {
    if (!sql) return;
    const rows = await sql`SELECT pg_get_functiondef('public.vendor_price_commissions()'::regprocedure) AS definition`;
    const definition = String(rows[0]?.["definition"]);
    const match = definition.match(/AS \$function\$([\s\S]*?)\$function\$/);
    if (!match?.[1]) throw new Error("Effective commission function missing");
    body = match[1].replaceAll("public.meters", "fixture_meters").replaceAll("public.units", "fixture_units")
      .replaceAll("public.owner_commission_settings", "fixture_general")
      .replaceAll("public.owner_property_commission_settings", "fixture_specific")
      .replaceAll("auth.uid()", "'vendor-a'").replaceAll("public.has_role('vendor-a', 'vendor')", "$1::boolean");
  });
  afterAll(async () => { await sql?.end(); });
  async function read(allowed = true) {
    if (!sql) throw new Error("Database connection required");
    return sql.unsafe(`WITH
      fixture_meters(id,landlord_id,agent_id,vendor_id,unit_id) AS (VALUES
        ('one','landlord-a',NULL::text,'vendor-a','u1'),
        ('two','landlord-a',NULL::text,'vendor-a','u2'),
        ('agent',NULL,'agent-a','vendor-a','u2'),
        ('vendor',NULL,NULL,'vendor-a',NULL),
        ('missing','unconfigured',NULL,'vendor-a','u1'),
        ('foreign','landlord-a',NULL,'vendor-b','u1')),
      fixture_units(id,property_id) AS (VALUES ('u1','p1'),('u2','p2')),
      fixture_general(owner_id,commission_payer,commission_percentage,vat_on_commission_percentage) AS (VALUES
        ('landlord-a','resident',5.25,16.0),('agent-a','owner',7.5,12.0),('vendor-a','owner',9.0,10.0)),
      fixture_specific(owner_id,property_id,commission_payer,commission_percentage,vat_on_commission_percentage) AS (VALUES
        ('landlord-a','p1','owner',3.25,8.0))
      ${body}`, [allowed]);
  }
  it("property-specific values override all three owner values only for that property", async () => {
    expect((await read()).find(r => r["id"] === "one")).toMatchObject({ commission_payer: "owner", commission_percentage: "3.25", vat_on_commission_percentage: "8.0" });
  });
  it("other properties use the owner's all-properties values, not the managing vendor's", async () => {
    expect((await read()).find(r => r["id"] === "two")).toMatchObject({ commission_payer: "resident", commission_percentage: "5.25", vat_on_commission_percentage: "16.0" });
  });
  it("resolves agent and vendor meter ownership independently", async () => {
    const rows = await read();
    expect(rows.find(r => r["id"] === "agent")?.["commission_percentage"]).toBe("7.5");
    expect(rows.find(r => r["id"] === "vendor")?.["commission_percentage"]).toBe("9.0");
  });
  it("does not substitute defaults when an owner is unconfigured", async () => {
    expect((await read()).find(r => r["id"] === "missing")).toMatchObject({ commission_payer: null, commission_percentage: null, vat_on_commission_percentage: null });
  });
  it("excludes another vendor's meters even when the owner is shared", async () => {
    expect((await read()).some(r => r["id"] === "foreign")).toBe(false);
  });
  it("requires the vendor role", async () => { expect(await read(false)).toHaveLength(0); });
  it("rejects anonymous execution while allowing authenticated execution", async () => {
    if (!sql) throw new Error("Database connection required");
    const rows = await sql`SELECT has_function_privilege('anon','public.vendor_price_commissions()','EXECUTE') AS anon, has_function_privilege('authenticated','public.vendor_price_commissions()','EXECUTE') AS authenticated`;
    expect(rows[0]).toMatchObject({ anon: false, authenticated: true });
  });
});