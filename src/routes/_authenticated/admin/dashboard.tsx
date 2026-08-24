import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, ShieldCheck, UserPlus, Users, Activity } from "lucide-react";
import { checkRoleAccess } from "@/lib/auth.functions";
import { getAdminStats } from "@/lib/stats.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { roleLabel } from "@/lib/portals";

export const Route = createFileRoute("/_authenticated/admin/dashboard")({
  head: () => ({
    meta: [
      { title: "Admin overview · SmatraPay" },
      {
        name: "description",
        content:
          "SmatraPay admin portal: account growth, portal role distribution, account statuses and the latest sign-ups.",
      },
      { property: "og:title", content: "Admin overview · SmatraPay" },
      {
        property: "og:description",
        content: "Platform-wide oversight of SmatraPay accounts, portals and account health.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "admin" } }),
  component: AdminDashboard,
  errorComponent: () => <p className="p-8 text-sm">Could not load this dashboard.</p>,
});

function AdminDashboard() {
  const access = Route.useLoaderData();
  const fetchStats = useServerFn(getAdminStats);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => fetchStats(),
    enabled: access.allowed,
  });

  const cards = [
    { label: "Total accounts", value: data?.total, icon: Users },
    { label: "New today", value: data?.newToday, icon: UserPlus },
    { label: "New this week", value: data?.newThisWeek, icon: Activity },
    { label: "Active accounts", value: data?.byStatus?.["active"] ?? 0, icon: ShieldCheck },
  ];

  return (
    <DashboardShell
      access={access}
      title="Admin overview"
      description="Platform-wide oversight: accounts, portals, statuses and recent activity."
      actions={
        <Link to="/users" className="btn-primary px-4 text-sm">
          Manage users
        </Link>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {card.label}
              </p>
              <card.icon className="size-4 text-primary" />
            </div>
            <p className="mt-3 text-3xl font-bold text-foreground">
              {isLoading ? "—" : (card.value ?? 0)}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold text-foreground">Portal distribution</h2>
          <ul className="mt-4 space-y-3">
            {Object.entries(data?.byRole ?? {})
              .sort((a, b) => b[1] - a[1])
              .map(([role, count]) => {
                const total = Math.max(1, data?.total ?? 1);
                return (
                  <li key={role}>
                    <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                      <span>{roleLabel(role)}</span>
                      <span className="text-foreground">{count}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-brand-gradient"
                        style={{ width: `${Math.min(100, (count / total) * 100)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            {!isLoading && Object.keys(data?.byRole ?? {}).length === 0 && (
              <li className="text-sm text-muted-foreground">No roles assigned yet.</li>
            )}
          </ul>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Newest accounts</h2>
            <Link
              to="/users"
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              View all <ArrowUpRight className="size-3" />
            </Link>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="pb-2 pr-4 font-semibold">User</th>
                  <th className="pb-2 pr-4 font-semibold">Portal</th>
                  <th className="pb-2 pr-4 font-semibold">Status</th>
                  <th className="pb-2 font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody>
                {(data?.recent ?? []).map((u) => (
                  <tr key={u.id} className="border-t border-border">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        {u.profile_image ? (
                          <img
                            src={u.profile_image}
                            alt={u.name ?? "User avatar"}
                            className="size-8 rounded-full object-cover"
                          />
                        ) : (
                          <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                            {(u.name ?? u.email ?? "?").charAt(0).toUpperCase()}
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{u.name ?? "—"}</p>
                          <p className="truncate text-xs text-muted-foreground">{u.email ?? "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">{roleLabel(u.role)}</td>
                    <td className="py-3 pr-4">
                      <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold capitalize text-secondary-foreground">
                        {u.status}
                      </span>
                    </td>
                    <td className="py-3 text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {!isLoading && (data?.recent ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-muted-foreground">
                      No accounts yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
