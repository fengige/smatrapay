import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Sparkles,
  UserPlus,
  Users,
  ShieldCheck,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
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

const STATUS_TONE: Record<string, string> = {
  active: "bg-primary",
  pending: "bg-accent",
  inactive: "bg-muted-foreground",
  suspended: "bg-destructive",
};

function fmt(n: number | undefined) {
  return typeof n === "number" ? n.toLocaleString() : "—";
}

function Trend({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] font-bold ${
        up ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
      }`}
    >
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {Math.abs(Math.round(value))}%
    </span>
  );
}

function AdminDashboard() {
  const access = Route.useLoaderData();
  const fetchStats = useServerFn(getAdminStats);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => fetchStats(),
    enabled: access.allowed,
  });

  const cards = [
    {
      label: "Total accounts",
      value: data?.total,
      icon: Users,
      trend: data?.growthPct ?? 0,
      caption: "All portals combined",
    },
    {
      label: "New this week",
      value: data?.newThisWeek,
      icon: UserPlus,
      trend: data?.growthPct ?? 0,
      caption: `${fmt(data?.newToday)} today`,
    },
    {
      label: "Staff accounts",
      value: data?.staffCount,
      icon: ShieldCheck,
      trend: 0,
      caption: "Admin, landlord, vendor, agent",
    },
    {
      label: "Active share",
      value: data ? Math.round(data.activeShare) : undefined,
      suffix: "%",
      icon: Activity,
      trend: 0,
      caption: `${fmt(data?.byStatus?.["active"])} active accounts`,
    },
  ];

  const daily = (data?.daily ?? []).map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  }));

  const roleEntries = Object.entries(data?.byRole ?? {}).sort((a, b) => b[1] - a[1]);
  const pieColors = [
    "var(--primary)",
    "var(--accent)",
    "color-mix(in oklch, var(--primary) 55%, white)",
    "color-mix(in oklch, var(--accent) 55%, white)",
    "var(--muted-foreground)",
    "color-mix(in oklch, var(--primary) 30%, white)",
  ];

  const statusEntries = Object.entries(data?.byStatus ?? {}).sort((a, b) => b[1] - a[1]);
  const statusTotal = Math.max(1, data?.total ?? 1);

  return (
    <DashboardShell
      access={access}
      title="Main dashboard"
      description="Welcome back — here's your SmatraPay platform overview for today"
      actions={
        <Link to="/users" className="btn-primary px-4 text-sm">
          Manage users
        </Link>
      }
    >
      {/* Insight banner */}
      <div className="relative overflow-hidden rounded-2xl bg-brand-panel px-5 py-4 text-panel-foreground">
        <div className="orb orb-1" aria-hidden />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-panel-tile">
            <Sparkles className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">
              Platform insight: {fmt(data?.newThisMonth)} new accounts in the last 30 days
            </p>
            <p className="mt-0.5 text-xs text-panel-muted">
              {fmt(data?.total)} total accounts · {roleEntries.length} portals in use ·{" "}
              {Math.round(data?.activeShare ?? 0)}% active
            </p>
          </div>
          <Link
            to="/users"
            className="rounded-xl bg-panel-tile px-4 py-2 text-xs font-bold transition-colors hover:bg-panel-tile/70"
          >
            View directory
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-border bg-card p-5 transition-shadow hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <card.icon className="size-4" />
              </span>
              {card.trend !== 0 && <Trend value={card.trend} />}
            </div>
            <p className="mt-4 text-3xl font-bold tracking-tight text-foreground">
              {isLoading ? "—" : `${fmt(card.value)}${card.suffix ?? ""}`}
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">{card.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{card.caption}</p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-foreground">Sign-ups</h2>
              <p className="text-xs text-muted-foreground">Last 14 days</p>
            </div>
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
              {fmt(data?.newThisWeek)} this week
            </span>
          </div>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="signupFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  interval="preserveStartEnd"
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="Sign-ups"
                  stroke="var(--primary)"
                  strokeWidth={2.5}
                  fill="url(#signupFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold text-foreground">Portal distribution</h2>
          <div className="mt-2 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={roleEntries.map(([role, count]) => ({ name: roleLabel(role), value: count }))}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={44}
                  outerRadius={68}
                  paddingAngle={2}
                  stroke="none"
                >
                  {roleEntries.map((_, i) => (
                    <Cell key={i} fill={pieColors[i % pieColors.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-3 space-y-2">
            {roleEntries.map(([role, count], i) => (
              <li key={role} className="flex items-center gap-2 text-xs font-semibold">
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: pieColors[i % pieColors.length] }}
                />
                <span className="flex-1 truncate text-muted-foreground">{roleLabel(role)}</span>
                <span className="text-foreground">{count}</span>
              </li>
            ))}
            {!isLoading && roleEntries.length === 0 && (
              <li className="text-sm text-muted-foreground">No roles assigned yet.</li>
            )}
          </ul>
        </section>
      </div>

      {/* Status + weekly activity */}
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Account health</h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[0.7rem] font-bold text-primary">
              <CheckCircle2 className="size-3" />
              {Math.round(data?.activeShare ?? 0)}% active
            </span>
          </div>
          <ul className="mt-4 space-y-3">
            {statusEntries.map(([status, count]) => (
              <li key={status}>
                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                  <span className="capitalize">{status}</span>
                  <span className="text-foreground">{count}</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${STATUS_TONE[status] ?? "bg-primary"}`}
                    style={{ width: `${Math.min(100, (count / statusTotal) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
            {!isLoading && statusEntries.length === 0 && (
              <li className="text-sm text-muted-foreground">No accounts yet.</li>
            )}
          </ul>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
          <h2 className="text-sm font-bold text-foreground">Daily activity</h2>
          <p className="text-xs text-muted-foreground">New accounts per day</p>
          <div className="mt-4 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  interval="preserveStartEnd"
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
                <Bar dataKey="count" name="Sign-ups" fill="var(--accent)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Recent accounts */}
      <section className="mt-5 rounded-2xl border border-border bg-card p-5">
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
    </DashboardShell>
  );
}
