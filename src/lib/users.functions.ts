import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createUserSchema } from "@/lib/user-schema";
import type { Database } from "@/integrations/supabase/types";

const statusEnum = z.enum(["active", "inactive", "suspended", "pending"]);
const roleEnum = z.enum([
  "admin",
  "landlord",
  "vendor",
  "agent",
  "service_provider",
  "resident",
  "moderator",
  "user",
]);

const profilePatch = z.object({
  id: z.string().uuid(),
  name: z.string().trim().max(120).nullable().optional(),
  username: z.string().trim().max(60).nullable().optional(),
  email: z.string().trim().email().max(255).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  profile_image: z.string().trim().max(500).nullable().optional(),
  bio: z.string().trim().max(1000).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  property: z.string().trim().max(120).nullable().optional(),
  building: z.string().trim().max(120).nullable().optional(),
  unit_number: z.string().trim().max(40).nullable().optional(),
  move_in_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  status: statusEnum.optional(),
  role: roleEnum.optional(),
});


export type ProfilePatch = z.infer<typeof profilePatch>;

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });

    // Only admin users can access this listing, and it only returns admin accounts.
    if (!isAdmin) throw new Error("Admin access required");

    const { data: adminRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .eq("role", "admin");
    if (rolesError) throw new Error(rolesError.message);

    const adminIds = (adminRoles ?? []).map((r) => r.user_id);

    const { data: profiles, error } = await supabase
      .from("users")
      .select("*")
      .in("id", adminIds)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    return {
      isAdmin: true,
      users: (profiles ?? []).map((p) => ({ ...p, role: "admin" as string })),
    };
  });

export const updateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => profilePatch.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { id, role, ...fields } = data;
    const patch = Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined),
    ) as Database["public"]["Tables"]["users"]["Update"];

    const { error } = await supabase
      .from("users")
      .update({ ...patch, updated_by: userId })
      .eq("id", id);
    if (error) throw new Error(error.message);

    if (role) {
      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "admin",
      });
      if (!isAdmin) throw new Error("Only admins can change roles");
      await supabase.from("user_roles").delete().eq("user_id", id);
      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({ user_id: id, role });
      if (roleError) throw new Error(roleError.message);
    }

    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("users").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createUserSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only admins can create users");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { name: data.name },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Could not create user");

    const id = created.user.id;
    const { error: profileError } = await supabaseAdmin.from("users").upsert({
      id,
      name: data.name,
      email: data.email,
      username: data.username || null,
      phone: data.phone || null,
      bio: data.bio || null,
      notes: data.notes || null,
      status: data.status,
      property: data.property || null,
      building: data.building || null,
      unit_number: data.unit_number || null,
      move_in_date: data.move_in_date || null,

      created_by: userId,
      updated_by: userId,
    });
    if (profileError) throw new Error(profileError.message);

    await supabaseAdmin.from("user_roles").delete().eq("user_id", id);
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: id, role: data.role });
    if (roleError) throw new Error(roleError.message);

    return { ok: true, id };
  });

export const getUserById = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: profile, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!profile) throw new Error("User not found");

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.id);

    return {
      user: profile,
      roles: (roles ?? []).map((r) => r.role as string),
    };
  });

export const sendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        redirectTo: z.string().trim().url().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only admins can send password resets");

    const { data: profile, error } = await supabase
      .from("users")
      .select("email")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!profile?.email) throw new Error("This user has no email address on file");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(profile.email, {
      ...(data.redirectTo ? { redirectTo: data.redirectTo } : {}),
    });
    if (resetError) throw new Error(resetError.message);

    return { ok: true, email: profile.email };
  });

const listSortColumns = ["name", "email", "phone", "status", "created_at"] as const;

export const listUsersByRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        role: roleEnum,
        status: statusEnum.optional(),
        q: z.string().trim().max(100).optional(),
        page: z.number().int().min(1).max(10000).optional(),
        limit: z.number().int().min(5).max(200).optional(),
        sortBy: z.enum(listSortColumns).optional(),
        sortDir: z.enum(["asc", "desc"]).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Admin access required");

    const { data: roleRows, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .eq("role", data.role);
    if (rolesError) throw new Error(rolesError.message);

    const ids = (roleRows ?? []).map((r) => r.user_id);
    if (ids.length === 0) {
      return {
        users: [],
        total: 0,
        counts: { total: 0, active: 0, pending: 0, suspended: 0 },
      };
    }

    const term = data.q ? `%${data.q}%` : null;

    const countByStatus = async (status?: string) => {
      let c = supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .in("id", ids);
      if (status) c = c.eq("status", status);
      if (term) c = c.or(`name.ilike.${term},email.ilike.${term}`);
      const { count, error: cErr } = await c;
      if (cErr) throw new Error(cErr.message);
      return count ?? 0;
    };

    const [all, active, pending, suspended] = await Promise.all([
      countByStatus(),
      countByStatus("active"),
      countByStatus("pending"),
      countByStatus("suspended"),
    ]);

    const paginated = data.page != null && data.limit != null;

    let q = supabase.from("users").select("*", { count: "exact" }).in("id", ids);

    if (data.status) {
      q = q.eq("status", data.status);
    }

    if (term) {
      q = q.or(`name.ilike.${term},email.ilike.${term}`);
    }

    q = q.order(data.sortBy ?? "created_at", {
      ascending: (data.sortDir ?? "desc") === "asc",
    });

    if (paginated) {
      const start = (data.page! - 1) * data.limit!;
      q = q.range(start, start + data.limit! - 1);
    }

    const { data: profiles, error, count } = await q;
    if (error) throw new Error(error.message);

    const profileIds = (profiles ?? []).map((p) => p.id);
    const { data: assignments, error: aErr } = profileIds.length
      ? await supabase
          .from("unit_assignments")
          .select("id, user_id, unit_id, start_date, end_date")
          .in("user_id", profileIds)
          .eq("role", "resident")
          .order("start_date", { ascending: false })
      : { data: [], error: null };
    if (aErr) throw new Error(aErr.message);

    const unitIds = [...new Set((assignments ?? []).map((a) => a.unit_id).filter(Boolean))];
    let units: { id: string; unit_number: string; property_id: string }[] = [];
    let properties: { id: string; name: string }[] = [];
    if (unitIds.length) {
      const { data: unitsRows, error: uErr } = await supabase
        .from("units")
        .select("id, unit_number, property_id")
        .in("id", unitIds);
      if (uErr) throw new Error(uErr.message);
      units = unitsRows ?? [];

      const propertyIds = [...new Set(units.map((u) => u.property_id).filter(Boolean))];
      if (propertyIds.length) {
        const { data: propRows, error: pErr } = await supabase
          .from("properties")
          .select("id, name")
          .in("id", propertyIds);
        if (pErr) throw new Error(pErr.message);
        properties = propRows ?? [];
      }
    }

    const propertyById = new Map(properties.map((p) => [p.id, p]));
    const unitById = new Map(units.map((u) => [u.id, { ...u, property: propertyById.get(u.property_id) ?? null }]));

    const byUser = new Map<string, (typeof assignments extends (infer T)[] ? T & { unit: { unit_number: string; property: { name: string } | null } | null } : never)[]>();
    for (const a of assignments ?? []) {
      const list = byUser.get(a.user_id) ?? [];
      list.push({
        ...a,
        unit: unitById.get(a.unit_id) ?? null,
      } as never);
      byUser.set(a.user_id, list);
    }

    return {
      users: (profiles ?? []).map((p) => ({
        ...p,
        role: data.role as string,
        assignments: (byUser.get(p.id) ?? []) as { id: string; user_id: string; start_date: string; end_date: string | null; unit: { unit_number: string; property: { name: string } | null } | null }[],
      })),
      total: count ?? (profiles ?? []).length,
      counts: {
        total: all,
        active,
        pending,
        suspended,
      },
    };
  });
