import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { unitInput } from "../unit-input";

const propertyId = "00000000-0000-0000-0000-000000000001";
describe("shared Unit Management validation", () => {
  it("trims unit numbers and retains the selected property", () => {
    expect(unitInput.parse({ property_id: propertyId, unit_number: "  001  " }))
      .toEqual({ property_id: propertyId, unit_number: "001" });
  });
  it("rejects empty and overlong unit numbers", () => {
    for (const unit_number of ["   ", "a".repeat(41)]) {
      expect(unitInput.safeParse({ property_id: propertyId, unit_number }).success).toBe(false);
    }
  });
  it("preserves the existing bedroom range and integer validation", () => {
    for (const bedrooms of [-1, 51, 1.5]) {
      expect(unitInput.safeParse({ property_id: propertyId, unit_number: "1", bedrooms }).success).toBe(false);
    }
    expect(unitInput.parse({ property_id: propertyId, unit_number: "1", bedrooms: 0 }).bedrooms).toBe(0);
    expect(unitInput.parse({ property_id: propertyId, unit_number: "1", bedrooms: 50 }).bedrooms).toBe(50);
  });
});

const connection = process.env["SUPABASE_DB_URL"];
const sql = connection ? postgres(connection, { max: 1, prepare: false }) : null;
const rollback = new Error("rollback test fixtures");

describe.skipIf(!sql)("vendor property unit database flow", () => {
  let vendorId = "";
  let otherId = "";
  let definition = "";
  beforeAll(async () => {
    if (!sql) return;
    const vendors = await sql`SELECT user_id FROM public.user_roles WHERE role='vendor' ORDER BY user_id LIMIT 2`;
    vendorId = vendors[0]?.["user_id"] ?? "";
    otherId = vendors[1]?.["user_id"] ?? "";
    if (!vendorId || !otherId) throw new Error("Two vendors required for isolation tests");
    const functions = await sql`SELECT pg_get_functiondef('public.create_vendor_property_unit(jsonb)'::regprocedure) AS definition`;
    definition = functions[0]?.["definition"] ?? "";
    if (!definition) throw new Error("Installed unit creation function missing");
  });
  afterAll(async () => { await sql?.end(); });

  async function scenario(run: (tx: postgres.TransactionSql, id: string) => Promise<void>, foreign = false) {
    if (!sql) throw new Error("Database connection required");
    try {
      await sql.begin(async (tx) => {
        // The restricted test role cannot execute authenticated-only RPCs or
        // SET ROLE. Run the deployed function body in a rollback-only temp copy.
        await tx.unsafe("CREATE TEMP TABLE unit_test_scope (id integer) ON COMMIT DROP");
        const actor = "current_setting('request.jwt.claim.sub')::uuid";
        const testDefinition = definition
          .replace("public.create_vendor_property_unit", "pg_temp.create_vendor_property_unit")
          .replaceAll("auth.uid()", actor)
          .replace("public.has_role(v_actor, 'vendor'::public.app_role)",
            "EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=v_actor AND role='vendor')")
          // Relationship helper is inaccessible to the sandbox test role; these
          // fixtures deliberately have no zone or meter relationships.
          .replace("SELECT s.property_id FROM private.vendor_scope_property_ids(v_actor) s",
            "SELECT NULL::uuid WHERE false");
        await tx.unsafe(testDefinition);
        const props = await tx`INSERT INTO public.properties (name, created_by, landlord_id, owner_type, number_of_units)
          VALUES (${`Unit test ${crypto.randomUUID()}`}, ${foreign ? otherId : vendorId}::uuid,
            ${foreign ? otherId : vendorId}::uuid, 'vendor', 0) RETURNING id`;
        const id = props[0]?.["id"];
        if (typeof id !== "string") throw new Error("Property fixture missing");
        await tx`SELECT set_config('request.jwt.claim.sub', ${vendorId}, true)`;
        await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: vendorId, role: "authenticated" })}, true)`;
        await run(tx, id);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  }

  it("creates and reads back an unmetered unit only under the selected owned property", async () => {
    await scenario(async (tx, id) => {
      const payload = { property_id: id, unit_number: "001", building: "North", bedrooms: 2, status: "vacant" };
      const created = await tx`SELECT pg_temp.create_vendor_property_unit(${JSON.stringify(payload)}::jsonb) AS id`;
      const rows = await tx`SELECT id, property_id, unit_number, bedrooms, created_by FROM public.units WHERE property_id=${id}::uuid`;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: created[0]?.["id"], property_id: id, unit_number: "001", bedrooms: 2, created_by: vendorId });
      // This test connection cannot SET ROLE authenticated. Evaluate the installed
      // SELECT predicate against the real inserted row with the vendor JWT claims.
      const policies = await tx`SELECT qual FROM pg_policies WHERE schemaname='public' AND tablename='units'
        AND policyname='Vendors can read units of their own properties'`;
      const predicate = policies[0]?.["qual"];
      if (typeof predicate !== "string") throw new Error("Unit visibility policy missing");
      const testPredicate = predicate
        .replaceAll("auth.uid()", "current_setting('request.jwt.claim.sub')::uuid")
        .replace(/(?:public\.)?has_role\(current_setting\('request.jwt.claim.sub'\)::uuid, 'vendor'::(?:public\.)?app_role\)/g,
          "EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=current_setting('request.jwt.claim.sub')::uuid AND role='vendor')");
      const visibility = await tx.unsafe(`SELECT (${testPredicate}) AS visible FROM public.units WHERE id=$1::uuid`, [rows[0]?.["id"]]);
      expect(visibility[0]?.["visible"]).toBe(true);
      const props = await tx`SELECT number_of_units FROM public.properties WHERE id=${id}::uuid`;
      expect(props[0]?.["number_of_units"]).toBe(1);
    });
  });

  it("rejects another vendor's property and rolls back all changes", async () => {
    await expect(scenario(async (tx, id) => {
      await tx`SELECT pg_temp.create_vendor_property_unit(${JSON.stringify({ property_id: id, unit_number: "001" })}::jsonb)`;
    }, true)).rejects.toThrow("Access denied");
  });

  it("rejects duplicate unit numbers within the same property", async () => {
    await expect(scenario(async (tx, id) => {
      const input = JSON.stringify({ property_id: id, unit_number: "001" });
      await tx`SELECT pg_temp.create_vendor_property_unit(${input}::jsonb)`;
      await tx`SELECT pg_temp.create_vendor_property_unit(${input}::jsonb)`;
    })).rejects.toThrow("already exists");
  });

  it("denies creation without the vendor role", async () => {
    await expect(scenario(async (tx, id) => {
      const unknown = "00000000-0000-0000-0000-000000000099";
      await tx`SELECT set_config('request.jwt.claim.sub', ${unknown}, true)`;
      await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: unknown, role: "authenticated" })}, true)`;
      await tx`SELECT pg_temp.create_vendor_property_unit(${JSON.stringify({ property_id: id, unit_number: "001" })}::jsonb)`;
    })).rejects.toThrow("Vendor access required");
  });
});