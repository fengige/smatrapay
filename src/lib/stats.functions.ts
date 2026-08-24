import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Admin-only platform overview metrics, computed server-side under RLS. */
export const getAdminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Admin access required");

    const [profilesResult, rolesResult] = await Promise.all([
      supabase.from("profiles").select("id, name, email, status, created_at, profile_image"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    if (profilesResult.error) throw new Error(profilesResult.error.message);

    const profiles = profilesResult.data ?? [];
    const roles = rolesResult.data ?? [];

    const byStatus: Record<string, number> = {};
    for (const p of profiles) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;

    const byRole: Record<string, number> = {};
    for (const r of roles) byRole[r.role] = (byRole[r.role] ?? 0) + 1;

    const now = Date.now();
    const since = (days: number) =>
      profiles.filter((p) => now - new Date(p.created_at).getTime() < days * 86400000).length;

    const roleByUser = new Map(roles.map((r) => [r.user_id, r.role as string]));

    const recent = [...profiles]
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      .slice(0, 6)
      .map((p) => ({
        id: p.id,
        name: p.name,
        email: p.email,
        status: p.status as string,
        created_at: p.created_at,
        profile_image: p.profile_image,
        role: roleByUser.get(p.id) ?? "user",
      }));

    return {
      total: profiles.length,
      newToday: since(1),
      newThisWeek: since(7),
      newThisMonth: since(30),
      byStatus,
      byRole,
      recent,
    };
  });
