import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { summarizeVendors } from "@/lib/admin-dashboard";

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

    // Read every page so totals and recent vendors are not capped by the API row limit.
    async function allRows<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
      const rows: T[] = [];
      for (let from = 0; ; from += 1000) {
        const result = await read(from, from + 999);
        if (result.error) throw new Error(result.error.message);
        rows.push(...(result.data ?? []));
        if ((result.data?.length ?? 0) < 1000) return rows;
      }
    }
    const [profiles, roles, meterTotal, activeMeters, properties, units, tokens, bankAttention, queuedPayments] = await Promise.all([
      allRows((from, to) => supabase.from("users").select("id, name, email, status, created_at, profile_image").order("id").range(from, to)),
      allRows((from, to) => supabase.from("user_roles").select("user_id, role").order("user_id").order("role").range(from, to)),
      supabase.from("meters").select("id", { count: "exact", head: true }),
      supabase.from("meters").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("properties").select("id", { count: "exact", head: true }),
      supabase.from("units").select("id", { count: "exact", head: true }),
      supabase.from("meter_tokens").select("id", { count: "exact", head: true }),
      supabase.from("bank_notifications").select("id", { count: "exact", head: true }).in("status", ["failed", "retry_pending", "needs_review", "processing"]),
      supabase.from("bank_notifications").select("id", { count: "exact", head: true }).eq("status", "retry_pending"),
    ]);
    for (const result of [meterTotal, activeMeters, properties, units, tokens, bankAttention, queuedPayments]) {
      if (result.error) throw new Error(result.error.message);
      if (result.count === null) throw new Error("Dashboard totals are unavailable");
    }
    const vendors = summarizeVendors(profiles, roles);

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

    const dayMs = 86400000;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const daily = Array.from({ length: 14 }, (_, i) => {
      const from = startOfToday.getTime() - (13 - i) * dayMs;
      const to = from + dayMs;
      const count = profiles.filter((p) => {
        const t = new Date(p.created_at).getTime();
        return t >= from && t < to;
      }).length;
      return { date: new Date(from).toISOString().slice(0, 10), count };
    });

    const last7 = since(7);
    const prev7 = profiles.filter((p) => {
      const age = now - new Date(p.created_at).getTime();
      return age >= 7 * dayMs && age < 14 * dayMs;
    }).length;
    const growthPct = prev7 === 0 ? (last7 > 0 ? 100 : 0) : ((last7 - prev7) / prev7) * 100;

    const activeShare = profiles.length
      ? ((byStatus["active"] ?? 0) / profiles.length) * 100
      : 0;

    return {
      vendors: { total: vendors.total, active: vendors.active },
      recentVendors: vendors.recent,
      meters: { total: meterTotal.count ?? 0, active: activeMeters.count ?? 0 },
      properties: properties.count ?? 0,
      units: units.count ?? 0,
      tokens: tokens.count ?? 0,
      bankAttention: bankAttention.count ?? 0,
      queuedPayments: queuedPayments.count ?? 0,
      updatedAt: new Date().toISOString(),
      total: profiles.length,
      newToday: since(1),
      newThisWeek: last7,
      newThisMonth: since(30),
      growthPct,
      activeShare,
      staffCount: roles.filter((r) => r.role !== "resident" && r.role !== "user").length,
      byStatus,
      byRole,
      daily,
      recent,
    };
  });

