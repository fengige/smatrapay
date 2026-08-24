import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  ArrowUpRight,
  ChevronRight,
  Gauge,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { checkRoleAccess } from "@/lib/auth.functions";
import { getAdminStats } from "@/lib/stats.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { useSessionIdentity } from "@/components/PortalLayout";
import { roleLabel } from "@/lib/portals";

export const Route = createFileRoute("/_authenticated/admin/dashboard")({
  head: () => ({
    meta: [
      { title: "Admin dashboard · SmatraPay" },
      {
        name: "description",
        content:
          "SmatraPay admin dashboard: account totals, portal distribution, platform statistics and the newest sign-ups.",
      },
      { property: "og:title", content: "Admin dashboard · SmatraPay" },
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

function fmt(n: number | undefined) {
  return typeof n === "number" ? n.toLocaleString() : "—";
}

function AdminDashboard() {
  const access = Route.useLoaderData();
  const identity = useSessionIdentity();
  const fetchStats = useServerFn(getAdminStats);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => fetchStats(),
    enabled: access.allowed,
  });

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const avatar =
    (identity.name || identity.email || "SA")
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() || "SA";

  const stats = [
    {
      label: "Total Accounts",
      value: fmt(data?.total),
      icon: Users,
      caption: `${fmt(data?.byStatus?.["active"])} active accounts`,
    },
    {
      label: "New This Week",
      value: fmt(data?.newThisWeek),
      icon: UserPlus,
      caption: `${fmt(data?.newToday)} joined today`,
    },
    {
      label: "Staff Accounts",
      value: fmt(data?.staffCount),
      icon: ShieldCheck,
      caption: "Admin, landlord, vendor, agent",
    },
    {
      label: "System Status",
      value: "Healthy",
      valueClass: "text-2xl",
      icon: Activity,
      caption: "All services operational",
    },
  ];

  const quickActions = [
    { label: "Add User", caption: "Create account", to: "/users", icon: UserPlus },
    { label: "Directory", caption: "Manage accounts", to: "/users", icon: Users },
    { label: "Account", caption: "System settings", to: "/users", icon: Gauge },
  ];

  const roleEntries = Object.entries(data?.byRole ?? {}).sort((a, b) => b[1] - a[1]);
  const chartData = roleEntries.map(([role, count]) => ({
    name: roleLabel(role),
    count,
  }));

  const networkRows = [
    { label: "Total accounts", value: data?.total, icon: Users },
    { label: "Active accounts", value: data?.byStatus?.["active"], icon: Activity },
    { label: "Portals in use", value: roleEntries.length, icon: ShieldCheck },
  ];

  return (
    <DashboardShell
      access={access}
      title="Admin dashboard"
      description="SmatraPay platform overview"
      hideHeading
    >
      {/* Hero banner */}
      <section className="relative overflow-hidden rounded-3xl bg-brand-panel px-6 py-7 text-panel-foreground sm:px-8">
        <div className="orb orb-1" aria-hidden />
        <div className="relative flex items-center gap-6">
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Admin Dashboard</h2>
            <p className="mt-1 text-sm font-semibold text-panel-foreground/90">
              Accounts, portals &amp; platform activity overview
            </p>
            <p className="mt-2 text-xs text-panel-muted">{today}</p>
          </div>
          <span className="hidden size-14 shrink-0 items-center justify-center rounded-full bg-background text-sm font-extrabold text-foreground sm:flex">
            {avatar}
          </span>
        </div>
      </section>

      {/* Stat cards */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-muted-foreground">{s.label}</p>
              <span className="flex size-9 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                <s.icon className="size-4" />
              </span>
            </div>
            <p
              className={`mt-3 font-extrabold tracking-tight text-foreground ${
                s.valueClass ?? "text-3xl"
              }`}
            >
              {isLoading && s.label !== "System Status" ? "—" : s.value}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{s.caption}</p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {quickActions.map((a) => (
          <Link
            key={a.label}
            to={a.to}
            className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 transition-shadow hover:shadow-md"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
              <a.icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-foreground">{a.label}</span>
              <span className="block text-xs text-muted-foreground">{a.caption}</span>
            </span>
            <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>

      {/* Statistics + side column */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
          <h2 className="text-base font-bold text-foreground">Platform Statistics</h2>
          <p className="text-sm text-muted-foreground">Overview of accounts by portal</p>
          <div className="mt-5 h-72">
            {chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No platform data available yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ left: 0, right: 8, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    width={28}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)" }}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "var(--card)",
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="count" name="Accounts" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <div className="space-y-4">
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-sm font-bold text-foreground">Recent Accounts</h2>
              <Link
                to="/users"
                className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
              >
                View All <ArrowUpRight className="size-3" />
              </Link>
            </div>
            <ul className="mt-3 space-y-3">
              {(data?.recent ?? []).slice(0, 5).map((u) => (
                <li key={u.id} className="flex items-center gap-3">
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
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {u.name ?? u.email ?? "—"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{roleLabel(u.role)}</p>
                  </div>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[0.7rem] font-semibold capitalize text-secondary-foreground">
                    {u.status}
                  </span>
                </li>
              ))}
              {!isLoading && (data?.recent ?? []).length === 0 && (
                <li className="py-6 text-center text-sm text-muted-foreground">
                  No accounts registered yet
                </li>
              )}
            </ul>
          </section>

          <section className="relative overflow-hidden rounded-2xl bg-brand-panel p-5 text-panel-foreground">
            <div className="relative">
              <h2 className="flex items-center gap-2 text-base font-bold">
                <Sparkles className="size-4" />
                Platform Status
              </h2>
              <p className="text-xs text-panel-muted">Registered entities overview</p>
              <ul className="mt-4 space-y-1">
                {networkRows.map((row) => (
                  <li
                    key={row.label}
                    className="flex items-center gap-3 border-b border-white/10 py-2.5 text-sm font-semibold last:border-0"
                  >
                    <row.icon className="size-4 text-panel-muted" />
                    <span className="flex-1">{row.label}</span>
                    <span>{fmt(row.value)}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/users"
                className="mt-4 flex w-full items-center justify-center rounded-xl bg-background px-4 py-2.5 text-sm font-bold text-foreground transition-opacity hover:opacity-90"
              >
                Review Accounts
              </Link>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <MessageSquare className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-bold text-foreground">Monthly growth</h2>
            </div>
            <p className="mt-2 text-2xl font-extrabold text-foreground">
              {fmt(data?.newThisMonth)}
            </p>
            <p className="text-xs text-muted-foreground">New accounts in the last 30 days</p>
          </section>
        </div>
      </div>
    </DashboardShell>
  );
}
