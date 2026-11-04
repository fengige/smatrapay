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
const sql = connection ? postgres(connection, { max: 1 }) : null;
const rollback = new Error("rollback test fixtures");

describe.skipIf(!sql)("vendor property unit database flow", () => {
  let vendorId = "";
  let otherId = "";
  beforeAll(async () => {
    if (!sql) return;
    const vendors = await sql`SELECT user_id FROM public.user_roles WHERE role='vendor' ORDER BY user_id LIMIT 2`;
    vendorId = vendors[0]?.["user_id"] ?? "";
    otherId = vendors[1]?.["user_id"] ?? "";
    if (!vendorId || !otherId) throw new Error("Two vendors required for isolation tests");
  });
  afterAll(async () => { await sql?.end(); });

  async function scenario(run: (tx: postgres.TransactionSql, id: string) => Promise<void>, foreign = false) {
    if (!sql) throw new Error("Database connection required");
    try {
      await sql.begin(async (tx) => {
        const props = await tx`INSERT INTO public.properties (name, created_by, landlord_id, owner_type, number_of_units)
          VALUES (${`Unit test ${crypto.randomUUID()}`}, ${foreign ? otherId : vendorId}::uuid,
            ${foreign ? otherId : vendorId}::uuid, 'vendor', 0) RETURNING id`;
        const id = props[0]?.["id"];
        if (typeof id !== "string") throw new Error("Property fixture missing");
        await tx`SELECT set_config('request.jwt.claim.sub', ${vendorId}, true)`;
        await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: vendorId, role: "authenticated" })}, true)`;
        await tx.unsafe("SET LOCAL ROLE authenticated");
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
      const created = await tx`SELECT public.create_vendor_property_unit(${JSON.stringify(payload)}::jsonb) AS id`;
      const rows = await tx`SELECT id, property_id, unit_number, bedrooms, created_by FROM public.units WHERE property_id=${id}::uuid`;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: created[0]?.["id"], property_id: id, unit_number: "001", bedrooms: 2, created_by: vendorId });
      const props = await tx`SELECT number_of_units FROM public.properties WHERE id=${id}::uuid`;
      expect(props[0]?.["number_of_units"]).toBe(1);
    });
  });

  it("rejects another vendor's property and rolls back all changes", async () => {
    await expect(scenario(async (tx, id) => {
      await tx`SELECT public.create_vendor_property_unit(${JSON.stringify({ property_id: id, unit_number: "001" })}::jsonb)`;
    }, true)).rejects.toThrow("Access denied");
  });

  it("rejects duplicate unit numbers within the same property", async () => {
    await expect(scenario(async (tx, id) => {
      const input = JSON.stringify({ property_id: id, unit_number: "001" });
      await tx`SELECT public.create_vendor_property_unit(${input}::jsonb)`;
      await tx`SELECT public.create_vendor_property_unit(${input}::jsonb)`;
    })).rejects.toThrow("already exists");
  });

  it("denies creation without the vendor role", async () => {
    await expect(scenario(async (tx, id) => {
      const unknown = "00000000-0000-0000-0000-000000000099";
      await tx`SELECT set_config('request.jwt.claim.sub', ${unknown}, true)`;
      await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: unknown, role: "authenticated" })}, true)`;
      await tx`SELECT public.create_vendor_property_unit(${JSON.stringify({ property_id: id, unit_number: "001" })}::jsonb)`;
    })).rejects.toThrow("Vendor access required");
  });
});