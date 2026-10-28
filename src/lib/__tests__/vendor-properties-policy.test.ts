import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const connection = process.env["SUPABASE_DB_URL"];
const sql = connection ? postgres(connection, { max: 1 }) : null;
const vendor = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";

describe.skipIf(!sql)("vendor own property visibility", () => {
  let policy = "";
  beforeAll(async () => {
    if (!sql) return;
    const rows = await sql`
      SELECT qual FROM pg_policies WHERE schemaname='public' AND tablename='properties'
        AND policyname='Vendors can view properties they own or created'
    `;
    const expression = rows[0]?.["qual"];
    if (typeof expression !== "string") throw new Error("Property policy missing");
    policy = expression;
  });
  afterAll(async () => { await sql?.end(); });

  async function visible(creator: string | null, owner: string | null, ownerType: string, isVendor = true) {
    if (!sql) throw new Error("Database connection required");
    const expression = policy
      .replace(/(?:public\.)?has_role\(auth\.uid\(\), 'vendor'::(?:public\.)?app_role\)/g, String(isVendor))
      .replace(/auth\.uid\(\)/g, "$1::uuid");
    const rows = await sql.unsafe(
      `SELECT coalesce((${expression}), false) AS visible
       FROM (SELECT $2::uuid AS created_by, $3::uuid AS landlord_id, $4::text AS owner_type) p`,
      [vendor, creator, owner, ownerType],
    );
    const result = rows[0]?.["visible"];
    if (typeof result !== "boolean") throw new Error("Visibility result missing");
    return result;
  }

  it("reads newly created properties without units or meters", async () => {
    expect(await visible(vendor, other, "landlord")).toBe(true);
  });
  it("reads explicitly vendor-owned properties added by an admin", async () => {
    expect(await visible(other, vendor, "vendor")).toBe(true);
  });
  it("rejects another vendor's unrelated property", async () => {
    expect(await visible(other, other, "vendor")).toBe(false);
  });
  it("requires the vendor role", async () => {
    expect(await visible(vendor, vendor, "vendor", false)).toBe(false);
  });
  it("requires vendor ownership type for owner-based access", async () => {
    expect(await visible(other, vendor, "landlord")).toBe(false);
  });
  it("does not expose unowned properties", async () => {
    expect(await visible(null, null, "vendor")).toBe(false);
  });
});