import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const connection = process.env["SUPABASE_DB_URL"];
const sql = connection ? postgres(connection, { max: 1 }) : null;

describe.skipIf(!sql)("installed resident Google registered-email security", () => {
  afterAll(async () => { await sql?.end(); });
  async function check(mode: string) {
    if (!sql) throw new Error("Database connection required");
    const rows = await sql`SELECT pg_get_functiondef('public.resident_google_access()'::regprocedure) definition`;
    let body = String(rows[0]?.["definition"]).match(/AS \$function\$([\s\S]*?)\$function\$/)?.[1];
    if (!body) throw new Error("Installed resident authorization function missing");
    // Execute the installed algorithm against isolated CTE fixtures: the test
    // connection cannot access managed Auth schemas or mutate production users.
    const id = "11111111-1111-4111-8111-111111111111";
    body = body.replaceAll("auth.uid()", mode === "anonymous" ? "NULL::uuid" : `'${id}'::uuid`)
      .replace(/FROM auth.identities i JOIN auth.users a ON a.id=i.user_id/, "FROM fixture_identities i JOIN fixture_auth a ON a.id=i.user_id")
      .replaceAll("public.users", "fixture_users").replaceAll("public.user_roles", "fixture_roles");
    const email = mode === "case" ? "  RESIDENT@EXAMPLE.COM  " : mode === "unregistered" ? "other@example.com" : "resident@example.com";
    const duplicate = mode === "duplicate" ? ` UNION ALL SELECT '22222222-2222-4222-8222-222222222222'::uuid,'resident@example.com','active'` : "";
    const fixture = `WITH fixture_identities AS (SELECT '${id}'::uuid user_id,'google' provider,'{"email":"resident@example.com","email_verified":true}'::jsonb identity_data), fixture_auth AS (SELECT '${id}'::uuid id,'resident@example.com'::text email,now() email_confirmed_at), fixture_users AS (SELECT '${id}'::uuid id,'${email}'::text email,'${mode === "inactive" ? "inactive" : "active"}'::text status${duplicate}), fixture_roles AS (SELECT id user_id,'resident'::text role FROM fixture_users) `;
    body = body.replaceAll("SELECT lower(btrim(i.identity_data", `${fixture}SELECT lower(btrim(i.identity_data`)
      .replaceAll("SELECT count(*)", `${fixture}SELECT count(*)`)
      .replaceAll("SELECT u.id,u.status", `${fixture}SELECT u.id,u.status`);
    const wrapped = `DO $test$ ${body.replace(/RETURN '([^']+)';/g, "RAISE EXCEPTION 'result:%', '$1';")} $test$`;
    try { await sql.unsafe(wrapped); } catch (error) {
      if (error instanceof Error && error.message.startsWith("result:")) return error.message.slice(7);
      throw error;
    }
    throw new Error("Authorization did not return a decision");
  }
  it("accepts a registered verified Google account", async () => expect(await check("allowed")).toBe("allowed"));
  it("matches trimmed case-insensitive registered emails", async () => expect(await check("case")).toBe("allowed"));
  it("denies unregistered email", async () => expect(await check("unregistered")).toBe("unregistered"));
  it("denies duplicate email matches", async () => expect(await check("duplicate")).toBe("duplicate"));
  it("denies inactive residents", async () => expect(await check("inactive")).toBe("inactive"));
  it("denies a missing authenticated identity", async () => expect(await check("anonymous")).toBe("unverified"));
  it("protects all public RLS tables against direct invalid Google data requests", async () => {
    if (!sql) throw new Error("Database connection required");
    const rows = await sql`SELECT count(*)::int missing FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity AND NOT EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND p.polname='resident_google_registered_guard' AND NOT p.polpermissive)`;
    expect(rows[0]?.["missing"]).toBe(0);
  });
});