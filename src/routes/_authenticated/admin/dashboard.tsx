import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  Building2,
  ChevronRight,
  Coins,
  Gauge,
  CreditCard,
  RefreshCw,
  Users,
  Zap,
} from "lucide-react";
import { useState } from "react";
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
import { getConfiguration } from "@/lib/configurations.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { useSessionIdentity } from "@/components/PortalLayout";
import { Button } from "@/components/ui/button";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";

export const Route = createFileRoute("/_authenticated/admin/dashboard")({
  head: () => ({
    meta: [
      { title: "Admin dashboard · SmatraPay" },
      {
        name: "description",
        content:
           "SmatraPay admin dashboard: current vendors, meters, properties, tokens and bank payments requiring attention.",
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

function CurrencyConverterCard() {
  const load = useServerFn(getConfiguration);
  const { data } = useQuery({
    queryKey: ["configuration", "currency"],
    queryFn: () => load({ data: { group: "currency" } } as never),
  });

  const values = data?.values ?? {};
  const code = values["currency_code"] || "KES";
  const symbol = values["currency_symbol"] || "KSh";
  const name = values["currency_name"] || "Default currency";
  const decimals = Math.min(4, Math.max(0, parseInt(values["currency_decimals"] || "2", 10) || 2));

  const [foreign, setForeign] = useState("USD");
  const [amount, setAmount] = useState("100");
  const [rate, setRate] = useState("");

  const parsedAmount = Number.parseFloat(amount);
  const parsedRate = Number.parseFloat(rate);
  const valid =
    Number.isFinite(parsedAmount) && parsedAmount >= 0 && Number.isFinite(parsedRate) && parsedRate > 0;
  const converted = valid ? parsedAmount * parsedRate : null;

  let formatted = "—";
  if (converted !== null) {
    try {
      formatted = new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: code,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(converted);
    } catch {
      formatted = `${symbol} ${converted.toFixed(decimals)}`;
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
          <Coins className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-foreground">Currency conversion</h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            Converts into {name} ({code})
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Foreign currency</span>
            <input
              value={foreign}
              onChange={(e) => setForeign(e.target.value.toUpperCase().slice(0, 3))}
              placeholder="USD"
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Amount</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="100"
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
            />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            Rate (1 {foreign || "unit"} = ? {code})
          </span>
          <input
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            inputMode="decimal"
            placeholder="129.50"
            className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
          />
        </label>
        <div className="rounded-xl bg-secondary px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">
            {valid
              ? `${parsedAmount.toLocaleString()} ${foreign || ""} equals`
              : "Enter an amount and rate to convert"}
          </p>
          <p className="mt-1 text-xl font-extrabold tracking-tight text-foreground">{formatted}</p>
        </div>
      </div>
    </section>
  );
}

function AdminDashboard() {
  const access = Route.useLoaderData();
  const identity = useSessionIdentity();
  const fetchStats = useServerFn(getAdminStats);
  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => fetchStats(),
    enabled: access.allowed,
    refetchInterval: 60_000,
  });
  useRealtimeRefresh("admin-dashboard", ["users", "user_roles", "meters", "properties", "units", "meter_tokens", "bank_notifications"], [["admin-stats"]], access.allowed);

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

  const vendors = data?.vendors.total;
  const meters = data?.meters.total;

  const stats = [
    {
      label: "Total Vendors",
      value: fmt(vendors),
      icon: Building2,
       caption: `${fmt(data?.vendors.active)} active vendors`,
       to: "/vendors",
    },
    {
      label: "Total Meters",
      value: fmt(meters),
      icon: Gauge,
       caption: `${fmt(data?.meters.active)} active meters`,
       to: "/meters",
    },
    {
       label: "Generated Tokens",
       value: fmt(data?.tokens),
       icon: Zap,
       caption: "All recorded tokens",
       to: "/token-ledger",
    },
    {
       label: "Payments Needing Attention",
       value: fmt(data?.bankAttention),
      icon: Activity,
       caption: `${fmt(data?.queuedPayments)} queued for retry`,
       to: "/bank-payments",
    },
  ];

  const quickActions = [
     { label: "Add Vendor", caption: "Create account", to: "/vendors/new", icon: Building2 },
     { label: "Meters", caption: "Registered meters", to: "/meters", icon: Gauge },
     { label: "Bank Payments", caption: "Payments & retries", to: "/bank-payments", icon: CreditCard },
   ] as const;

  const chartData = [
    { name: "Vendors", count: vendors },
     { name: "Active Vendors", count: data?.vendors.active },
    { name: "Meters", count: meters },
     { name: "Active Meters", count: data?.meters.active },
     { name: "Properties", count: data?.properties },
     { name: "Units", count: data?.units },
  ];
   const hasChartData = chartData.some((d) => (d.count ?? 0) > 0);

   const recentVendors = data?.recentVendors ?? [];

  const networkRows = [
    { label: "Total Vendors", value: vendors, icon: Building2 },
     { label: "Active Meters", value: data?.meters.active, icon: Gauge },
     { label: "Properties", value: data?.properties, icon: Building2 },
     { label: "Units", value: data?.units, icon: Users },
  ];

  return (
    <DashboardShell
      access={access}
      title="Admin dashboard"
      description="Smart metering & vending program overview"
      hideHeading
    >
      {/* Hero banner */}
      <section className="relative overflow-hidden rounded-3xl bg-brand-panel px-6 py-7 text-panel-foreground sm:px-8">
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

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p role={isError ? "alert" : undefined} className={isError ? "text-sm text-destructive" : "text-xs text-muted-foreground"}>
          {isError ? "Could not refresh dashboard records. Please try again." : data ? `Updated ${new Date(data.updatedAt).toLocaleTimeString()}` : "Loading dashboard records…"}
        </p>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={isFetching ? "size-4 animate-spin" : "size-4"} /> Refresh
        </Button>
      </div>

      {/* Stat cards */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
           <Link key={s.label} to={s.to} className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-muted-foreground">{s.label}</p>
              <span className="flex size-9 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                <s.icon className="size-4" />
              </span>
            </div>
            <p
               className="mt-3 text-3xl font-extrabold text-foreground"
            >
               {isLoading ? "—" : s.value}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{s.caption}</p>
           </Link>
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
           <p className="text-sm text-muted-foreground">Vendors, meters, properties &amp; units</p>
          <div className="mt-5 h-72">
            {!hasChartData ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                 {isError ? "Records unavailable" : isLoading ? "Loading records…" : "No platform records yet"}
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
          <CurrencyConverterCard />
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-sm font-bold text-foreground">Recent Vendors</h2>
              <Link
                 to="/vendors"
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
                     <Link to="/vendors/$id" params={{ id: u.id }} className="block truncate text-sm font-semibold text-foreground hover:text-primary">
                      {u.name ?? u.email ?? "—"}
                     </Link>
                     <p className="truncate text-xs text-muted-foreground">{u.email ?? "Vendor"}</p>
                  </div>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[0.7rem] font-semibold capitalize text-secondary-foreground">
                    {u.status}
                  </span>
                </li>
              ))}
              {recentVendors.length === 0 && (
                <li className="py-8 text-center text-sm text-muted-foreground">
                   {isError ? "Vendor records unavailable" : isLoading ? "Loading vendors…" : "No vendors registered yet"}
                </li>
              )}
            </ul>
          </section>

          <section className="relative overflow-hidden rounded-2xl bg-brand-panel p-5 text-panel-foreground">
            <div className="relative">
              <h2 className="flex items-center gap-2 text-base font-bold">
                <Zap className="size-4" />
                 Portfolio Summary
              </h2>
              <p className="text-xs text-panel-muted">Registered entities overview</p>
              <ul className="mt-4 space-y-1">
                {networkRows.map((row) => (
                  <li
                    key={row.label}
                     className="flex items-center gap-3 border-b border-panel-foreground/10 py-2.5 text-sm font-semibold last:border-0"
                  >
                    <row.icon className="size-4 text-panel-muted" />
                    <span className="flex-1">{row.label}</span>
                    <span>{fmt(row.value)}</span>
                  </li>
                ))}
              </ul>
              <Link
                 to="/meter-dashboard"
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
