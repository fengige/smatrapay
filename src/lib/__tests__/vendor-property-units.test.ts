import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { unitInput } from "../unit-input";

const vendor = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
describe("shared Unit Management validation", () => {
  it("trims unit numbers and retains the selected property", () => {
    expect(unitInput.parse({ property_id: vendor, unit_number: "  001  " }))
      .toEqual({ property_id: vendor, unit_number: "001" });
  });
  it("rejects empty and overlong unit numbers", () => {
    for (const unit_number of ["   ", "a".repeat(41)]) {
      expect(unitInput.safeParse({ property_id: vendor, unit_number }).success).toBe(false);
    }
  });
  it("preserves the existing bedroom range and integer validation", () => {
    for (const bedrooms of [-1, 51, 1.5]) {
      expect(unitInput.safeParse({ property_id: vendor, unit_number: "1", bedrooms }).success).toBe(false);
    }
    expect(unitInput.parse({ property_id: vendor, unit_number: "1", bedrooms: 50 }).bedrooms).toBe(50);
  });
});

const connection = process.env["SUPABASE_DB_URL"];
const sql = connection ? postgres(connection, { max: 1, prepare: false }) : null;
// The sandbox SQL role cannot assume authenticated or execute its private RPCs.
// Evaluate the actual installed ownership condition, not a duplicated JS rule.
describe.skipIf(!sql)("installed vendor unit ownership and grants", () => {
  let scope = "";
  beforeAll(async () => {
    if (!sql) return;
    const rows = await sql`SELECT pg_get_functiondef('public.create_vendor_property_unit(jsonb)'::regprocedure) AS definition`;
    const definition = rows[0]?.["definition"];
    if (typeof definition !== "string") throw new Error("Unit RPC missing");
    const match = definition.match(/IF NOT FOUND OR NOT \(([\s\S]*?)\) THEN/);
    if (!match?.[1]) throw new Error("Unit ownership guard missing");
    scope = match[1].replaceAll("v_property.", "p.").replaceAll("v_actor", "$1::uuid")
      .replace(/SELECT s.property_id FROM private.vendor_scope_property_ids\(\$1::uuid\) s/,
        "SELECT $4::uuid WHERE $5::boolean");
  });
  afterAll(async () => { await sql?.end(); });
  async function allowed(creator: string, owner: string, type: string, related = false) {
    if (!sql) throw new Error("Test connection missing");
    const rows = await sql.unsafe(`SELECT coalesce((${scope}), false) AS allowed
      FROM (SELECT $2::uuid AS created_by, $3::uuid AS landlord_id, $4::uuid AS id, $6::text AS owner_type) p`,
      [vendor, creator, owner, other, related, type]);
    return rows[0]?.["allowed"];
  }
  it("allows own created property with no meters or units", async () => {
    expect(await allowed(vendor, other, "landlord")).toBe(true);
  });
  it("allows explicitly vendor-owned property", async () => {
    expect(await allowed(other, vendor, "vendor")).toBe(true);
  });
  it("allows existing authorized relationship scope", async () => {
    expect(await allowed(other, other, "landlord", true)).toBe(true);
  });
  it("denies another vendor's unrelated property", async () => {
    expect(await allowed(other, other, "vendor")).toBe(false);
  });
  it("does not mistake a landlord owner for vendor ownership", async () => {
    expect(await allowed(other, vendor, "landlord")).toBe(false);
  });
  it("allows authenticated execution but denies anonymous execution", async () => {
    if (!sql) throw new Error("Test connection missing");
    const rows = await sql`SELECT has_function_privilege('authenticated', 'public.create_vendor_property_unit(jsonb)', 'EXECUTE') AS authed,
      has_function_privilege('anon', 'public.create_vendor_property_unit(jsonb)', 'EXECUTE') AS anon`;
    expect(rows[0]?.["authed"]).toBe(true);
    expect(rows[0]?.["anon"]).toBe(false);
  });
});
