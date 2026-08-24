import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  Building2,
  ChevronRight,
  Gauge,
  MessageSquare,
  ShieldCheck,
  Users,
  Zap,
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
          "SmatraPay admin dashboard: vendors, meters, pending enquiries, platform statistics and system status.",
      },
      { property: "og:title", content: "Admin dashboard · SmatraPay" },
      {
        property: "og:description",
        content: "Smart metering & vending program overview for the SmatraPay platform.",
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

  const vendors = data?.byRole?.["vendor"] ?? 0;
  const meters = 0;
  const enquiries = 0;

  const stats = [
    {
      label: "Total Vendors",
      value: fmt(vendors),
      icon: Building2,
      caption: `${fmt(data?.byStatus?.["active"])} active accounts`,
    },
    {
      label: "Total Meters",
      value: fmt(meters),
      icon: Gauge,
      caption: "Registered devices",
    },
    {
      label: "Pending Enquiries",
      value: fmt(enquiries),
      icon: MessageSquare,
      caption: "New website leads",
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
    { label: "Add Vendor", caption: "Create account", to: "/users", icon: Building2 },
    { label: "Meters", caption: "Manage units", to: "/users", icon: Gauge },
    { label: "Account", caption: "System settings", to: "/users", icon: ShieldCheck },
  ];

  const chartData = [
    { name: "Vendors", count: vendors },
    { name: "Active Vendors", count: data?.byStatus?.["active"] ?? 0 },
    { name: "Meters", count: meters },
    { name: "Active Meters", count: meters },
    { name: "Pending Enquiries", count: enquiries },
    { name: "Resolved Enquiries", count: 0 },
  ];
  const hasChartData = chartData.some((d) => d.count > 0);

  const recentVendors = (data?.recent ?? []).filter((u) => u.role === "vendor").slice(0, 5);

  const networkRows = [
    { label: "Total Vendors", value: vendors, icon: Building2 },
    { label: "Active Meters", value: meters, icon: Gauge },
    { label: "Total Meters", value: meters, icon: Users },
  ];

  return (
    <DashboardShell
      access={access}
      title="Admin dashboard"
      description="Smart metering & vending program overview"
      hideHeading
    >
      {/* Welcome bar */}
      <div className="mb-4 rounded-xl border border-border bg-card px-4 py-3">
        <p className="text-sm font-bold text-foreground">
          Welcome, {identity.name || "Super Admin"}
        </p>
      </div>

      {/* Hero banner */}
      <section className="relative overflow-hidden rounded-3xl bg-brand-panel px-6 py-7 text-panel-foreground sm:px-8">
        <div className="orb orb-1" aria-hidden />
        <div className="relative flex items-center gap-6">
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Admin Dashboard</h2>
            <p className="mt-1 text-sm font-semibold text-panel-foreground/90">
              Smart metering &amp; vending program overview
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
          <p className="text-sm text-muted-foreground">Overview of vendors, meters &amp; enquiries</p>
          <div className="mt-5 h-72">
            {!hasChartData ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No platform data available yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ left: 0, right: 8, top: 8, bottom: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    angle={-25}
                    textAnchor="end"
                    height={50}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
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
                  <Bar dataKey="count" name="Count" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <div className="space-y-4">
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-sm font-bold text-foreground">Recent Vendors</h2>
              <Link
                to="/users"
                className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
              >
                View All <ChevronRight className="size-3" />
              </Link>
            </div>
            <ul className="mt-3 space-y-3">
              {recentVendors.map((u) => (
                <li key={u.id} className="flex items-center gap-3">
                  {u.profile_image ? (
                    <img
                      src={u.profile_image}
                      alt={u.name ?? "Vendor avatar"}
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
              {recentVendors.length === 0 && (
                <li className="py-8 text-center text-sm text-muted-foreground">
                  No vendors registered yet
                </li>
              )}
            </ul>
          </section>

          <section className="relative overflow-hidden rounded-2xl bg-brand-panel p-5 text-panel-foreground">
            <div className="relative">
              <h2 className="flex items-center gap-2 text-base font-bold">
                <Zap className="size-4" />
                Network Status
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
                Review Fleet
              </Link>
            </div>
          </section>
        </div>
      </div>
    </DashboardShell>
  );
}
