import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { residentOnlyIds } from "../resident-roles";

describe("resident-only list scope", () => {
  it("keeps accounts whose only role is resident", () => {
    expect(residentOnlyIds(["a", "b"], [])).toEqual(["a", "b"]);
  });

  it("excludes accounts that also hold staff roles", () => {
    expect(residentOnlyIds(["a", "b", "c"], ["b"])).toEqual(["a", "c"]);
  });

  it("excludes every dual-role account even when all candidates have extra roles", () => {
    expect(residentOnlyIds(["a", "b"], ["a", "b"])).toEqual([]);
  });
});

const connection = process.env["SUPABASE_DB_URL"];
const sql = connection ? postgres(connection, { max: 1 }) : null;

describe.skipIf(!sql)("installed vendor resident list rule", () => {
  it("excludes accounts holding any non-resident role", async () => {
    if (!sql) throw new Error("Database required");
    const rows = await sql`select pg_get_functiondef('public.vendor_resident_list_ids()'::regprocedure) definition`;
    const definition = String(rows[0]?.["definition"] ?? "");
    expect(definition).toContain("NOT EXISTS");
    expect(definition).toContain("r2.role <> 'resident'");
    await sql.end();
  });
});
