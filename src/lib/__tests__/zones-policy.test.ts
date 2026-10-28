import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

// Exercise the installed SELECT policy with controlled identities and a false
// relationship lookup: STABLE helpers cannot see a just-inserted zone yet.
const connection = process.env["SUPABASE_DB_URL"];
const sql = connection ? postgres(connection, { max: 1 }) : null;

describe.skipIf(!sql)("zone creation read-back permissions", () => {
  let policy = "";

  beforeAll(async () => {
    if (!sql) return;
    const rows = await sql`
      SELECT qual FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'zones'
        AND policyname = 'Vendors can view their zones'
    `;
    expect(rows).toHaveLength(1);
    const installedPolicy = rows[0]?.["qual"];
    if (typeof installedPolicy !== "string") throw new Error("Zone SELECT policy missing");
    policy = installedPolicy;
  });

  afterAll(async () => { await sql?.end(); });

  async function allowed(isVendor: boolean, owner: string, linked = false) {
    if (!sql) throw new Error("Database connection required");
    const expression = policy
      .replace(/(?:public\.)?has_role\(auth\.uid\(\), 'vendor'::(?:public\.)?app_role\)/g, String(isVendor))
      .replace(/private\.vendor_can_access_zone\(auth\.uid\(\), zone_id\)/g, String(linked));
    const rows = await sql.unsafe(
      `SELECT ${expression.replace(/auth\.uid\(\)/g, "$1::uuid")} AS allowed
       FROM (SELECT $2::uuid AS vendor_id, 1 AS zone_id) AS zone`,
      ["00000000-0000-0000-0000-000000000001", owner],
    );
    const result = rows[0]?.["allowed"];
    if (typeof result !== "boolean") throw new Error("Zone permission result missing");
    return result;
  }

  it("reads a vendor's new zone before the relationship helper sees it", async () => {
    expect(await allowed(true, "00000000-0000-0000-0000-000000000001")).toBe(true);
  });

  it("does not expose another vendor's unlinked zone", async () => {
    expect(await allowed(true, "00000000-0000-0000-0000-000000000002")).toBe(false);
  });

  it("retains existing property-linked zone access", async () => {
    expect(await allowed(true, "00000000-0000-0000-0000-000000000002", true)).toBe(true);
  });

  it("does not grant vendor access without the vendor role", async () => {
    expect(await allowed(false, "00000000-0000-0000-0000-000000000001")).toBe(false);
  });
});