import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Loader2,
  MapPin,
  Search,
  ShieldAlert,
  UserCheck,
  Users as UsersIcon,
} from "lucide-react";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import {
  EmptyState,
  ErrorBlock,
  formatDate,
  installationLabel,
  titleCase,
  useVendorScope,
} from "@/components/vendor/VendorUI";

export const Route = createFileRoute("/_authenticated/vendor/residents/")({
  head: () => ({
    meta: [
      { title: "Resident Management · Vendor · SmatraPay" },
      {
        name: "description",
        content: "Residents living in the zones served by your vendor account.",
      },
      { property: "og:title", content: "Resident Management · Vendor · SmatraPay" },
      {
        property: "og:description",
        content: "Look up residents, their units and the meters serving them.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorResidentsPage,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{error.message}</p>,
});

const LIMIT_OPTIONS = [10, 25, 50, 100];
const STATUSES = ["active", "pending", "inactive", "suspended"];

const statusTone: Record<string, string> = {
  active: "bg-emerald-500/12 text-emerald-600",
  pending: "bg-amber-500/15 text-amber-600",
  inactive: "bg-muted text-muted-foreground",
  suspended: "bg-destructive/12 text-destructive",
};

type SortKey = "name" | "phone" | "property" | "zone" | "meter" | "status" | "created_at";

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof UsersIcon;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className={`size-4 ${tone ?? "text-primary"}`} />
      </div>
      <div className="mt-2 text-2xl font-bold text-foreground">{value}</div>
    </div>
  );
}

function initials(name: string | null, email: string | null) {
  const source = name || email || "?";
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function VendorResidentsPage() {
  const access = Route.useLoaderData();
  const { data, isLoading, error, refetch, isFetching } = useVendorScope();

  const [search, setSearch] = useState("");
  const [zoneFilter, setZoneFilter] = useState("all");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const residents = data?.residents ?? [];

  const propertyOptions = useMemo(
    () =>
      [...new Set(residents.map((r) => r.property_name).filter(Boolean) as string[])].sort((a, b) =>
        a.localeCompare(b),
      ),
    [residents],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = residents.filter((r) => {
      if (zoneFilter !== "all" && String(r.zone_id ?? "") !== zoneFilter) return false;
      if (propertyFilter !== "all" && r.property_name !== propertyFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!term) return true;
      return [r.name, r.email, r.phone, r.meter_number, r.unit_label, r.property_name, r.zone_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });

    const key = (r: (typeof rows)[number]) => {
      if (sortKey === "property") return (r.property_name ?? "").toLowerCase();
      if (sortKey === "zone") return (r.zone_name ?? "").toLowerCase();
      if (sortKey === "meter") return (r.meter_number ?? "").toLowerCase();
      return String(r[sortKey] ?? "").toLowerCase();
    };

    return [...rows].sort((a, b) => {
      const av = key(a);
      const bv = key(b);
      if (av === bv) return 0;
      return sortDir === "asc" ? (av > bv ? 1 : -1) : av > bv ? -1 : 1;
    });
  }, [residents, search, zoneFilter, propertyFilter, statusFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, totalPages);
  const paged = filtered.slice((current - 1) * pageSize, current * pageSize);

  const stats = useMemo(() => {
    const unique = new Map(residents.map((r) => [r.id, r]));
    const list = [...unique.values()];
    return {
      total: list.length,
      active: list.filter((r) => r.status === "active").length,
      pending: list.filter((r) => r.status === "pending").length,
      suspended: list.filter((r) => r.status === "suspended").length,
    };
  }, [residents]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  };

  const exportCsv = () => {
    const header = [
      "Resident",
      "Email",
      "Phone",
      "Zone",
      "Property",
      "Unit",
      "Meter",
      "Meter Type",
      "Meter Status",
      "Installation",
      "Account Status",
      "Registered",
    ];
    const rows = filtered.map((r) => [
      r.name ?? "",
      r.email ?? "",
      r.phone ?? "",
      r.zone_name ?? "",
      r.property_name ?? "",
      r.unit_label ?? "",
      r.meter_number ?? "",
      titleCase(r.meter_type),
      titleCase(r.meter_status),
      installationLabel(r.installation_status),
      r.status,
      formatDate(r.created_at),
    ]);
    const csv = [header, ...rows]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vendor-residents-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const SortHeader = ({ label, sortBy }: { label: string; sortBy: SortKey }) => (
    <th className="px-4 py-3 font-semibold">
      <button
        type="button"
        onClick={() => toggleSort(sortBy)}
        className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground"
      >
        {label}
        {sortKey === sortBy &&
          (sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  );

  return (
    <DashboardShell
      access={access}
      title="Resident Management"
      description="Residents in the zones served by your account"
    >
      <div className="space-y-5 pb-6">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={!filtered.length}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10 disabled:opacity-60"
          >
            <Download className="size-4" /> Export CSV ({filtered.length})
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10"
          >
            <Loader2 className={`size-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Residents" value={stats.total} icon={UsersIcon} />
          <StatCard label="Active" value={stats.active} icon={UserCheck} tone="text-emerald-600" />
          <StatCard label="Pending" value={stats.pending} icon={UsersIcon} tone="text-amber-600" />
          <StatCard
            label="Suspended"
            value={stats.suspended}
            icon={ShieldAlert}
            tone="text-destructive"
          />
        </div>

        {error ? (
          <ErrorBlock message={(error as Error).message} />
        ) : (
          <section className="rounded-2xl border border-border bg-card">
            <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
              <div className="flex min-w-[220px] flex-1 items-stretch overflow-hidden rounded-lg border border-border focus-within:border-primary">
                <span className="flex items-center bg-muted/50 px-3 text-muted-foreground">
                  <Search className="size-4" />
                </span>
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search residents by name, email, phone, meter, property or unit"
                  aria-label="Search residents"
                  className="w-full bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/70"
                />
              </div>
              <select
                value={zoneFilter}
                onChange={(e) => {
                  setZoneFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter by zone"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="all">All zones</option>
                {(data?.zones ?? []).map((z) => (
                  <option key={z.zone_id} value={String(z.zone_id)}>
                    {z.zone_name}
                  </option>
                ))}
              </select>
              <select
                value={propertyFilter}
                onChange={(e) => {
                  setPropertyFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter by property"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="all">All properties</option>
                {propertyOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter by account status"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="all">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {titleCase(s)}
                  </option>
                ))}
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-left text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <SortHeader label="Resident" sortBy="name" />
                    <SortHeader label="Phone" sortBy="phone" />
                    <SortHeader label="Zone" sortBy="zone" />
                    <SortHeader label="Property / unit" sortBy="property" />
                    <SortHeader label="Meter" sortBy="meter" />
                    <th className="px-4 py-3 font-semibold">Installation</th>
                    <SortHeader label="Status" sortBy="status" />
                    <SortHeader label="Registered" sortBy="created_at" />
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                        <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
                        Loading residents…
                      </td>
                    </tr>
                  ) : paged.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                        {residents.length === 0
                          ? "No residents are currently associated with your assigned zones."
                          : "No residents match these filters."}
                      </td>
                    </tr>
                  ) : (
                    paged.map((r) => (
                      <tr key={`${r.id}-${r.unit_id}`} className="border-t border-border/70">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="inline-flex size-9 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-semibold text-primary">
                              {r.profile_image ? (
                                <img
                                  src={r.profile_image}
                                  alt={r.name ?? "Resident avatar"}
                                  className="size-full object-cover"
                                />
                              ) : (
                                initials(r.name, r.email)
                              )}
                            </span>
                            <div>
                              <div className="font-medium text-foreground">{r.name ?? "—"}</div>
                              <div className="text-xs text-muted-foreground">{r.email ?? "—"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{r.phone ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.zone_name ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {r.property_name ?? "—"}
                          {r.unit_label ? ` · Unit ${r.unit_label}` : ""}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {r.meter_number ?? "—"}
                          <div className="text-xs">
                            {titleCase(r.meter_type)}
                            {r.meter_status ? ` · ${titleCase(r.meter_status)}` : ""}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {installationLabel(r.installation_status)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                              statusTone[r.status] ?? "bg-muted text-muted-foreground"
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(r.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link
                              to="/vendor/residents/$residentId"
                              params={{ residentId: r.id }}
                              aria-label="View resident"
                              className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent/10"
                            >
                              <Eye className="size-4" />
                            </Link>
                            {r.zone_id != null && (
                              <Link
                                to="/vendor/zones/$zoneId"
                                params={{ zoneId: String(r.zone_id) }}
                                aria-label="View zone"
                                className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent/10"
                              >
                                <MapPin className="size-4" />
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>Rows per page</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  aria-label="Rows per page"
                  className="rounded-lg border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
                >
                  {LIMIT_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <span>
                  {filtered.length === 0 ? 0 : (current - 1) * pageSize + 1}–
                  {Math.min(current * pageSize, filtered.length)} of {filtered.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(1, current - 1))}
                  disabled={current <= 1}
                  aria-label="Previous page"
                  className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent/10 disabled:opacity-50"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span className="text-muted-foreground">
                  Page {current} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(Math.min(totalPages, current + 1))}
                  disabled={current >= totalPages}
                  aria-label="Next page"
                  className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent/10"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          </section>
        )}

        {!isLoading && !error && residents.length === 0 && (
          <EmptyState
            title="No residents"
            message="No residents are currently associated with your assigned zones."
          />
        )}
      </div>
    </DashboardShell>
  );
}
