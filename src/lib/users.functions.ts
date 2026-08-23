import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const statusEnum = z.enum(["active", "inactive", "suspended", "pending"]);
const roleEnum = z.enum(["admin", "moderator", "user"]);

const profilePatch = z.object({
  id: z.string().uuid(),
  name: z.string().trim().max(120).nullable().optional(),
  username: z.string().trim().max(60).nullable().optional(),
  email: z.string().trim().email().max(255).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  profile_image: z.string().trim().max(500).nullable().optional(),
  bio: z.string().trim().max(1000).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
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

    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const roleByUser = new Map<string, string>();
    for (const r of roles ?? []) roleByUser.set(r.user_id, r.role);

    return {
      isAdmin: Boolean(isAdmin),
      users: (profiles ?? []).map((p) => ({ ...p, role: roleByUser.get(p.id) ?? "user" })),
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
    ) as Parameters<ReturnType<typeof supabase.from<"profiles">>["update"]>[0];

    const { error } = await supabase
      .from("profiles")
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
    const { error } = await context.supabase.from("profiles").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
