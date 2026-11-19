import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
const connection = process.env["SUPABASE_DB_URL"];
const sql = connection ? postgres(connection, { max: 1 }) : null;
describe.skipIf(!sql)("installed vendor application privacy and lifecycle", () => {
  afterAll(async () => {
    await sql?.end();
  });
  it("denies public reads/writes and browser review execution", async () => {
    if (!sql) throw new Error("Database required");
    const r =
      await sql`select has_table_privilege('anon','public.vendor_applications','SELECT') anon_read,has_table_privilege('anon','public.vendor_applications','INSERT') anon_insert,has_table_privilege('authenticated','public.vendor_applications','UPDATE') browser_write,has_function_privilege('authenticated','public.claim_vendor_application_review(uuid,uuid,text,text)','EXECUTE') browser_review`;
    expect(r[0]).toMatchObject({
      anon_read: false,
      anon_insert: false,
      browser_write: false,
      browser_review: false,
    });
  });
  it("nonadmin authenticated users cannot list applications", async () => {
    if (!sql) throw new Error("Database required");
    const policies =
      await sql`select roles,cmd,qual from pg_policies where schemaname='public' and tablename='vendor_applications'`;
    expect(policies).toHaveLength(1);
    expect(policies[0]?.["qual"]).toContain("has_role(auth.uid(), 'admin'");
    expect(policies[0]?.["cmd"]).toBe("SELECT");
  });
  it("application indexes prevent duplicate open email and phone", async () => {
    if (!sql) throw new Error("Database required");
    const r =
      await sql`select indexname,indexdef from pg_indexes where schemaname='public' and tablename='vendor_applications'`;
    for (const name of ["vendor_applications_open_email", "vendor_applications_open_phone"])
      expect(r.find((x) => x["indexname"] === name)?.["indexdef"]).toContain("UNIQUE INDEX");
  });
  it("reserves one account identity, rejects simultaneous review and audits a rejection", async () => {
    if (!sql) throw new Error("Database required");
    await sql.begin(async (tx) => {
      const admin = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      await tx.unsafe(
        "CREATE TEMP TABLE fixture_apps (LIKE public.vendor_applications INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP; CREATE TEMP TABLE fixture_events (LIKE public.vendor_application_events INCLUDING DEFAULTS) ON COMMIT DROP; CREATE TEMP TABLE fixture_roles(user_id uuid,role text) ON COMMIT DROP; CREATE TEMP TABLE fixture_users(id uuid,email text,phone text) ON COMMIT DROP;",
      );
      await tx`insert into fixture_roles values(${admin},'admin')`;
      const defs =
        await tx`select pg_get_functiondef('public.claim_vendor_application_review(uuid,uuid,text,text)'::regprocedure) definition`;
      const definition = String(defs[0]?.["definition"])
        .replace("public.claim_vendor_application_review", "pg_temp.fixture_claim")
        .replaceAll("public.vendor_applications", "pg_temp.fixture_apps")
        .replaceAll("public.vendor_application_events", "pg_temp.fixture_events")
        .replaceAll("public.user_roles", "pg_temp.fixture_roles")
        .replaceAll("public.users", "pg_temp.fixture_users")
        .replaceAll("auth.users", "pg_temp.fixture_users");
      await tx.unsafe(definition);
      const insert = async () =>
        (
          await tx`insert into fixture_apps(submission_key,business_name,business_type,contact_name,email,phone,location,services,contact_preference,consent) values(gen_random_uuid(),'Fixture business','Company','Fixture contact','fixture@example.test','+254712345678','Nairobi',ARRAY['Electricity'],'Email',true) returning id`
        )[0]?.["id"];
      const id = await insert();
      const first =
        await tx`select (pg_temp.fixture_claim(${id},${admin},'Accepted','')).vendor_user_id account`;
      expect(first[0]?.["account"]).toBeTruthy();
      await expect(
        tx.savepoint(async (s) => s`select pg_temp.fixture_claim(${id},${admin},'Accepted','')`),
      ).rejects.toThrow("in progress");
      await tx`update fixture_apps set processing_at=null where id=${id}`;
      const again =
        await tx`select (pg_temp.fixture_claim(${id},${admin},'Accepted','')).vendor_user_id account`;
      expect(again[0]?.["account"]).toBe(first[0]?.["account"]);
      await expect(
        tx.savepoint(
          async (s) => s`select pg_temp.fixture_claim(${id},${admin},'Rejected','Reason')`,
        ),
      ).rejects.toThrow("provisioning");
      const rejected = await insert();
      await expect(
        tx.savepoint(
          async (s) => s`select pg_temp.fixture_claim(${rejected},${admin},'Rejected','')`,
        ),
      ).rejects.toThrow("reason");
      await tx`select pg_temp.fixture_claim(${rejected},${admin},'Rejected','Incomplete information')`;
      expect(
        (await tx`select status,vendor_user_id from fixture_apps where id=${rejected}`)[0],
      ).toMatchObject({ status: "Rejected", vendor_user_id: null });
      expect(
        (
          await tx`select event_type,actor_id,detail from fixture_events where application_id=${rejected}`
        )[0],
      ).toMatchObject({
        event_type: "Rejected",
        actor_id: admin,
        detail: "Incomplete information",
      });
      await expect(
        tx.savepoint(
          async (s) => s`select pg_temp.fixture_claim(${rejected},${admin},'Accepted','')`,
        ),
      ).rejects.toThrow("already reviewed");
      const conflict = await insert();
      await tx`insert into fixture_users values(gen_random_uuid(),'fixture@example.test',null)`;
      await expect(
        tx.savepoint(
          async (s) => s`select pg_temp.fixture_claim(${conflict},${admin},'Accepted','')`,
        ),
      ).rejects.toThrow("conflict");
    });
  });
  it("atomic completion creates the linked vendor profile with exactly the vendor role and cannot repeat", async () => {
    if (!sql) throw new Error("Database required");
    await sql.begin(async (tx) => {
      const actor = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      const account = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
      const applicationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
      await tx.unsafe(
        "CREATE TEMP TABLE completion_apps (LIKE public.vendor_applications INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP; CREATE TEMP TABLE completion_events (LIKE public.vendor_application_events INCLUDING DEFAULTS) ON COMMIT DROP; CREATE TEMP TABLE completion_roles(user_id uuid,role text) ON COMMIT DROP; CREATE TEMP TABLE completion_users(id uuid PRIMARY KEY,name text,email text,phone text,bio text,status text,created_by uuid,updated_by uuid) ON COMMIT DROP; CREATE TEMP TABLE completion_auth(id uuid,email text,raw_app_meta_data jsonb) ON COMMIT DROP;",
      );
      await tx`insert into completion_roles values(${actor},'admin'),(${account},'resident')`;
      await tx`insert into completion_auth values(${account},'fixture@example.test',jsonb_build_object('vendor_application_id',${applicationId}::text))`;
      await tx`insert into completion_apps(id,submission_key,business_name,business_type,contact_name,email,phone,location,services,contact_preference,consent,vendor_user_id,processing_by) values(${applicationId},gen_random_uuid(),'Fixture vendor','Company','Fixture contact','fixture@example.test','+254712345678','Nairobi',ARRAY['Electricity'],'Email',true,${account},${actor})`;
      const defs =
        await tx`select pg_get_functiondef('public.complete_vendor_application(uuid,uuid)'::regprocedure) definition`;
      await tx.unsafe(
        String(defs[0]?.["definition"])
          .replace("public.complete_vendor_application", "pg_temp.fixture_complete")
          .replaceAll("public.vendor_applications", "pg_temp.completion_apps")
          .replaceAll("public.vendor_application_events", "pg_temp.completion_events")
          .replaceAll("public.user_roles", "pg_temp.completion_roles")
          .replaceAll("public.users", "pg_temp.completion_users")
          .replaceAll("auth.users", "pg_temp.completion_auth"),
      );
      await tx`select pg_temp.fixture_complete(${applicationId},${actor})`;
      expect((await tx`select * from completion_users`)[0]).toMatchObject({
        id: account,
        name: "Fixture vendor",
        email: "fixture@example.test",
        phone: "+254712345678",
        status: "active",
        created_by: actor,
      });
      expect(await tx`select role from completion_roles where user_id=${account}`).toEqual([
        { role: "vendor" },
      ]);
      expect(
        (await tx`select status,reviewed_by,vendor_user_id from completion_apps`)[0],
      ).toMatchObject({ status: "Accepted", reviewed_by: actor, vendor_user_id: account });
      await expect(
        tx.savepoint(async (s) => s`select pg_temp.fixture_complete(${applicationId},${actor})`),
      ).rejects.toThrow("Invalid acceptance");
      expect(await tx`select * from completion_users`).toHaveLength(1);
    });
  });
});
