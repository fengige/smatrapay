import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  createServiceProviderSchema,
  editServiceProviderSchema,
  fullName,
  serviceEntrySchema,
  serviceKey,
} from "@/lib/service-provider-schema";

const uuid = z.string().uuid();
const OPEN_JOB = ["open", "assigned", "in_progress"];

type Ctx = { supabase: any; userId: string };

async function assertAdmin(ctx: Ctx) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Admin access required");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/** Ensures the id is a non-deleted service provider. */
async function assertProvider(sb: any, id: string) {
  const [{ data: role }, { data: profile }] = await Promise.all([
    sb.from("user_roles").select("user_id").eq("user_id", id).eq("role", "service_provider").maybeSingle(),
    sb.from("service_provider_profiles").select("deleted_at").eq("user_id", id).maybeSingle(),
  ]);
  if (!role || profile?.deleted_at) throw new Error("Service provider not found");
}

/** Team-member ids linked to provider user accounts (jobs reference these). */
async function memberIdsByUser(sb: any, userIds: string[]) {
  const map = new Map<string, string[]>();
  if (!userIds.length) return map;
  const { data } = await sb.from("installation_team_members").select("id, user_id").in("user_id", userIds);
  for (const m of data ?? []) {
    const list = map.get(m.user_id) ?? [];
    list.push(m.id);
    map.set(m.user_id, list);
  }
  return map;
}

const clean = (v: string | undefined | null) => (v && v.trim() ? v.trim() : null);

export const listServiceProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.string().trim().max(100).optional(),
        service: z.string().trim().max(100).optional(),
        status: z.enum(["active", "suspended"]).optional(),
        page: z.number().int().min(1).max(10000).default(1),
        limit: z.number().int().min(5).max(200).default(10),
        sortBy: z.enum(["name", "email", "phone", "status", "created_at"]).default("created_at"),
        sortDir: z.enum(["asc", "desc"]).default("desc"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const sb = context.supabase as any;

    const [{ data: roles, error: rErr }, { data: deleted }] = await Promise.all([
      sb.from("user_roles").select("user_id").eq("role", "service_provider"),
      sb.from("service_provider_profiles").select("user_id").not("deleted_at", "is", null),
    ]);
    if (rErr) throw new Error(rErr.message);
    const deletedSet = new Set((deleted ?? []).map((d: any) => d.user_id));
    let ids: string[] = (roles ?? []).map((r: any) => r.user_id).filter((id: string) => !deletedSet.has(id));

    if (data.service) {
      const { data: svc } = await sb
        .from("service_provider_services")
        .select("provider_id")
        .ilike("service_name", `%${data.service}%`);
      const allowed = new Set((svc ?? []).map((s: any) => s.provider_id));
      ids = ids.filter((id) => allowed.has(id));
    }

    const empty = { rows: [], total: 0, counts: { total: 0, active: 0, suspended: 0 } };
    if (!ids.length) return empty;

    const term = data.q ? `%${data.q.replace(/[,()]/g, " ")}%` : null;
    const count = async (status?: string) => {
      let c = sb.from("users").select("id", { count: "exact", head: true }).in("id", ids);
      if (status) c = c.eq("status", status);
      const { count: n } = await c;
      return n ?? 0;
    };
    const [total, active, suspended] = await Promise.all([count(), count("active"), count("suspended")]);

    let q = sb
      .from("users")
      .select("id, name, email, phone, username, profile_image, status, created_at", { count: "exact" })
      .in("id", ids);
    if (data.status) q = q.eq("status", data.status);
    if (term) q = q.or(`name.ilike.${term},email.ilike.${term},phone.ilike.${term}`);
    q = q.order(data.sortBy, { ascending: data.sortDir === "asc" });
    const start = (data.page - 1) * data.limit;
    q = q.range(start, start + data.limit - 1);
    const { data: users, error, count: filtered } = await q;
    if (error) throw new Error(error.message);

    const pageIds = (users ?? []).map((u: any) => u.id);
    const [{ data: profiles }, { data: services }, members] = await Promise.all([
      pageIds.length
        ? sb.from("service_provider_profiles").select("user_id, logo_url, business_name").in("user_id", pageIds)
        : { data: [] },
      pageIds.length
        ? sb.from("service_provider_services").select("provider_id, service_name").in("provider_id", pageIds)
        : { data: [] },
      memberIdsByUser(sb, pageIds),
    ]);
    const allMembers = [...members.values()].flat();
    const { data: jobs } = allMembers.length
      ? await sb.from("service_requests").select("technician_id").in("technician_id", allMembers)
      : { data: [] };
    const jobsByMember = new Map<string, number>();
    for (const j of jobs ?? []) jobsByMember.set(j.technician_id, (jobsByMember.get(j.technician_id) ?? 0) + 1);

    const profileById = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
    return {
      rows: (users ?? []).map((u: any) => {
        const p: any = profileById.get(u.id);
        return {
          ...u,
          logo_url: p?.logo_url ?? null,
          business_name: p?.business_name ?? null,
          services: (services ?? []).filter((s: any) => s.provider_id === u.id).map((s: any) => s.service_name as string),
          total_jobs: (members.get(u.id) ?? []).reduce((n, m) => n + (jobsByMember.get(m) ?? 0), 0),
        };
      }),
      total: filtered ?? 0,
      counts: { total, active, suspended },
    };
  });

export const createServiceProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createServiceProviderSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const sb = await admin();
    const name = fullName(data);

    const { data: created, error } = await sb.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (error || !created?.user) throw new Error(error?.message ?? "Could not create account");
    const id = created.user.id as string;

    const rollback = async () => {
      await sb.from("service_provider_services").delete().eq("provider_id", id);
      await sb.from("service_provider_profiles").delete().eq("user_id", id);
      await sb.from("user_roles").delete().eq("user_id", id);
      await sb.from("users").delete().eq("id", id);
      await sb.auth.admin.deleteUser(id);
    };

    try {
      const { error: uErr } = await sb.from("users").upsert({
        id,
        name,
        email: data.email,
        username: clean(data.username),
        phone: clean(data.phone),
        address: clean(data.address),
        bio: clean(data.bio),
        notes: clean(data.notes),
        status: "active",
        created_by: context.userId,
        updated_by: context.userId,
      });
      if (uErr) throw uErr;
      await sb.from("user_roles").delete().eq("user_id", id);
      const { error: roleErr } = await sb.from("user_roles").insert({ user_id: id, role: "service_provider" });
      if (roleErr) throw roleErr;
      const { error: pErr } = await sb.from("service_provider_profiles").insert({
        user_id: id,
        first_name: data.first_name,
        middle_name: clean(data.middle_name),
        last_name: data.last_name,
        business_name: clean(data.business_name),
        country: clean(data.country),
        county: clean(data.county),
        city: clean(data.city),
        postal_address: clean(data.postal_address),
        created_by: context.userId,
      });
      if (pErr) throw pErr;
      const { error: sErr } = await sb.from("service_provider_services").insert(
        data.services.map((s) => ({ provider_id: id, service_name: s.service_name, description: s.description })),
      );
      if (sErr) throw sErr;
    } catch (e) {
      await rollback();
      throw new Error((e as { message?: string }).message ?? "Could not create service provider");
    }
    return { ok: true, id };
  });

export const getServiceProvider = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const sb = context.supabase as any;
    await assertProvider(sb, data.id);

    const [{ data: user }, { data: profile }, { data: services }, members] = await Promise.all([
      sb
        .from("users")
        .select("id, name, email, phone, username, address, profile_image, bio, notes, status, created_at, updated_at")
        .eq("id", data.id)
        .maybeSingle(),
      sb.from("service_provider_profiles").select("*").eq("user_id", data.id).maybeSingle(),
      sb.from("service_provider_services").select("*").eq("provider_id", data.id).order("created_at"),
      memberIdsByUser(sb, [data.id]),
    ]);
    if (!user) throw new Error("Service provider not found");

    const memberIds = members.get(data.id) ?? [];
    const { data: jobs } = memberIds.length
      ? await sb.from("service_requests").select("status").in("technician_id", memberIds)
      : { data: [] };
    const js = (jobs ?? []) as { status: string }[];

    let lastLogin: string | null = null;
    try {
      const a = await admin();
      const { data: au } = await a.auth.admin.getUserById(data.id);
      lastLogin = au?.user?.last_sign_in_at ?? null;
    } catch {
      lastLogin = null;
    }

    return {
      user,
      profile: profile ?? null,
      services: services ?? [],
      lastLogin,
      stats: {
        total: js.length,
        pending: js.filter((j) => j.status === "open" || j.status === "assigned").length,
        inProgress: js.filter((j) => j.status === "in_progress").length,
        completed: js.filter((j) => j.status === "resolved" || j.status === "closed").length,
      },
    };
  });

export const updateServiceProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => editServiceProviderSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const sb = context.supabase as any;
    await assertProvider(sb, data.id);

    const { data: current } = await sb.from("users").select("email").eq("id", data.id).maybeSingle();
    if (current && current.email !== data.email) {
      const a = await admin();
      const { error } = await a.auth.admin.updateUserById(data.id, { email: data.email, email_confirm: true });
      if (error) throw new Error(error.message);
    }

    const { error } = await sb
      .from("users")
      .update({
        name: fullName(data),
        email: data.email,
        phone: clean(data.phone),
        username: clean(data.username),
        address: clean(data.address),
        bio: clean(data.bio),
        notes: clean(data.notes),
        updated_by: context.userId,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    const { error: pErr } = await sb.from("service_provider_profiles").upsert({
      user_id: data.id,
      first_name: data.first_name,
      middle_name: clean(data.middle_name),
      last_name: data.last_name,
      business_name: clean(data.business_name),
      country: clean(data.country),
      county: clean(data.county),
      city: clean(data.city),
      postal_address: clean(data.postal_address),
    });
    if (pErr) throw new Error(pErr.message);
    return { ok: true };
  });

export const setServiceProviderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, status: z.enum(["active", "suspended"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const sb = context.supabase as any;
    await assertProvider(sb, data.id);
    const { error } = await sb
      .from("users")
      .update({ status: data.status, updated_by: context.userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Soft delete: hides the provider and blocks sign-in; jobs, services and history are kept. */
export const deleteServiceProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const sb = context.supabase as any;
    await assertProvider(sb, data.id);
    const now = new Date().toISOString();
    const { data: existing } = await sb
      .from("service_provider_profiles")
      .select("user_id")
      .eq("user_id", data.id)
      .maybeSingle();
    if (existing) {
      const { error } = await sb
        .from("service_provider_profiles")
        .update({ deleted_at: now, deleted_by: context.userId })
        .eq("user_id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { data: u } = await sb.from("users").select("name").eq("id", data.id).maybeSingle();
      const parts = String(u?.name ?? "Provider").split(" ");
      const { error } = await sb.from("service_provider_profiles").insert({
        user_id: data.id,
        first_name: parts[0] || "Provider",
        last_name: parts.slice(1).join(" ") || "-",
        deleted_at: now,
        deleted_by: context.userId,
      });
      if (error) throw new Error(error.message);
    }
    const { error } = await sb
      .from("users")
      .update({ status: "inactive", updated_by: context.userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setServiceProviderImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ id: uuid, kind: z.enum(["logo", "photo"]), url: z.string().trim().url().max(2000).nullable() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const sb = context.supabase as any;
    await assertProvider(sb, data.id);
    if (data.kind === "photo") {
      const { error } = await sb
        .from("users")
        .update({ profile_image: data.url, updated_by: context.userId })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { data: existing } = await sb
        .from("service_provider_profiles")
        .select("user_id")
        .eq("user_id", data.id)
        .maybeSingle();
      if (!existing) throw new Error("Save the provider's details first, then upload a logo");
      const { error } = await sb
        .from("service_provider_profiles")
        .update({ logo_url: data.url })
        .eq("user_id", data.id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

async function assertUniqueService(sb: any, providerId: string, name: string, exceptId?: string) {
  const { data } = await sb.from("service_provider_services").select("id, service_name").eq("provider_id", providerId);
  if ((data ?? []).some((s: any) => s.id !== exceptId && serviceKey(s.service_name) === serviceKey(name))) {
    throw new Error("This provider already offers a service with that name");
  }
}

export const addProviderService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => serviceEntrySchema.extend({ provider_id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const sb = context.supabase as any;
    await assertProvider(sb, data.provider_id);
    const { data: profile } = await sb
      .from("service_provider_profiles")
      .select("user_id")
      .eq("user_id", data.provider_id)
      .maybeSingle();
    if (!profile) throw new Error("Save the provider's details first, then add services");
    await assertUniqueService(sb, data.provider_id, data.service_name);
    const { error } = await sb.from("service_provider_services").insert({
      provider_id: data.provider_id,
      service_name: data.service_name,
      description: data.description,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateProviderService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    serviceEntrySchema.extend({ id: uuid, status: z.enum(["active", "inactive"]).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const sb = context.supabase as any;
    const { data: row } = await sb.from("service_provider_services").select("provider_id").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Service not found");
    await assertUniqueService(sb, row.provider_id, data.service_name, data.id);
    const { error } = await sb
      .from("service_provider_services")
      .update({
        service_name: data.service_name,
        description: data.description,
        ...(data.status ? { status: data.status } : {}),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeProviderService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const { error } = await (context.supabase as any).from("service_provider_services").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listProviderJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid,
        q: z.string().trim().max(100).optional(),
        status: z.enum(["open", "assigned", "in_progress", "resolved", "closed", "cancelled"]).optional(),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(5).max(100).default(10),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const sb = context.supabase as any;
    const members = (await memberIdsByUser(sb, [data.id])).get(data.id) ?? [];
    if (!members.length) return { rows: [], total: 0 };

    let q = sb
      .from("service_requests")
      .select(
        "id, request_number, issue_type, description, status, priority, preferred_date, created_at, completed_at, resolution, work_performed, resident_id, meter_id",
        { count: "exact" },
      )
      .in("technician_id", members);
    if (data.status) q = q.eq("status", data.status);
    if (data.from) q = q.gte("created_at", `${data.from}T00:00:00+03:00`);
    if (data.to) q = q.lte("created_at", `${data.to}T23:59:59.999+03:00`);
    if (data.q) {
      const t = `%${data.q.replace(/[,()]/g, " ")}%`;
      q = q.or(`request_number.ilike.${t},issue_type.ilike.${t},description.ilike.${t}`);
    }
    const start = (data.page - 1) * data.limit;
    q = q.order("created_at", { ascending: false }).range(start, start + data.limit - 1);
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);

    const residentIds = [...new Set((rows ?? []).map((r: any) => r.resident_id).filter(Boolean))];
    const meterIds = [...new Set((rows ?? []).map((r: any) => r.meter_id).filter(Boolean))];
    const [{ data: residents }, { data: meters }] = await Promise.all([
      residentIds.length ? sb.from("users").select("id, name").in("id", residentIds) : { data: [] },
      meterIds.length ? sb.from("meters").select("id, meter_number, unit_id").in("id", meterIds) : { data: [] },
    ]);
    const unitIds = [...new Set((meters ?? []).map((m: any) => m.unit_id).filter(Boolean))];
    const { data: units } = unitIds.length
      ? await sb.from("units").select("id, unit_number, property_id").in("id", unitIds)
      : { data: [] };
    const propIds = [...new Set((units ?? []).map((u: any) => u.property_id).filter(Boolean))];
    const { data: props } = propIds.length
      ? await sb.from("properties").select("id, name").in("id", propIds)
      : { data: [] };

    const byId = <T extends { id: string }>(l: T[] | null) => new Map((l ?? []).map((x) => [x.id, x]));
    const rm = byId(residents), mm = byId(meters), um = byId(units), pm = byId(props);
    return {
      total: count ?? 0,
      rows: (rows ?? []).map((r: any) => {
        const m: any = mm.get(r.meter_id);
        const u: any = m ? um.get(m.unit_id) : null;
        const p: any = u ? pm.get(u.property_id) : null;
        return {
          ...r,
          resident_name: (rm.get(r.resident_id) as any)?.name ?? null,
          meter_number: m?.meter_number ?? null,
          unit_number: u?.unit_number ?? null,
          property_name: p?.name ?? null,
          is_open: OPEN_JOB.includes(r.status),
        };
      }),
    };
  });
