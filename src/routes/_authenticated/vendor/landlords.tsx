import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  UserCheck,
  Users as UsersIcon,
  X,
} from "lucide-react";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { getVendorDirectory, type VendorOwnerRow } from "@/lib/vendor-admin.functions";
import { downloadCsv, EmptyState, ErrorBlock, titleCase } from "@/components/vendor/VendorUI";

export const Route = createFileRoute("/_authenticated/vendor/landlords")({
  head: () => ({
    meta: [
      { title: "Landlord Management · Vendor · SmatraPay" },
      {
        name: "description",
        content: "Property owners behind the meters registered to your vendor account.",
      },
      { property: "og:title", content: "Landlord Management · Vendor · SmatraPay" },
      {
        property: "og:description",
        content: "View the owners of the properties where your meters are installed.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorLandlords,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{error.message}</p>,
});

const STATUSES = ["active", "pending", "inactive", "suspended"];
const LIMIT_OPTIONS = [10, 25, 50, 100];

const statusTone: Record<string, string> = {
  active: "bg-emerald-500/12 text-emerald-600",
  pending: "bg-amber-500/15 text-amber-600",
  inactive: "bg-muted text-muted-foreground",
  suspended: "bg-destructive/12 text-destructive",
};

type SortKey = "name" | "phone" | "status" | "created_at";

function date(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "";
}

function initials(row: VendorOwnerRow) {
  const source = row.name || row.email || "?";
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function VendorLandlords() {
  const access = Route.useLoaderData();
  const fetchDirectory = useServerFn(getVendorDirectory);
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["vendor-directory"],
    queryFn: () => fetchDirectory(),
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const owners = useMemo(() => data?.owners ?? [], [data]);

  const counts = useMemo(
    () => ({
      total: owners.length,
      active: owners.filter((o) => o.status === "active").length,
      pending: owners.filter((o) => o.status === "pending").length,
      suspended: owners.filter((o) => o.status === "suspended").length,
    }),
    [owners],
  );

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = owners.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (typeFilter !== "all" && o.owner_type !== typeFilter) return false;
      if (!needle) return true;
      return [o.name, o.email, o.phone].some((v) => (v ?? "").toLowerCase().includes(needle));
    });
    return [...filtered].sort((a, b) => {
      const av = String(a[sortKey] ?? "").toLowerCase();
      const bv = String(b[sortKey] ?? "").toLowerCase();
      if (av === bv) return 0;
      return sortDir === "asc" ? (av > bv ? 1 : -1) : av > bv ? -1 : 1;
    });
  }, [owners, search, statusFilter, typeFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleSort = (key: SortKey) => {
    setPage(1);
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const exportCsv = () =>
    downloadCsv(
      `vendor-landlords-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Full Name", "Type", "Email", "Phone", "Properties", "Units", "Meters", "Status", "Joined"],
      rows.map((r) => [
        r.name ?? "",
        titleCase(r.owner_type),
        r.email ?? "",
        r.phone ?? "",
        r.property_count,
        r.unit_count,
        r.meter_count,
        r.status,
        date(r.created_at),
      ]),
    );

  const SortHeader = ({ label, sortBy }: { label: string; sortBy: SortKey }) => (
    <th className="px-3 py-2 font-semibold">
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
      title="Landlord Management"
      description="Owners of the properties where your meters are installed"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={!rows.length}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10 disabled:opacity-60"
          >
            <Download className="size-4" /> Export CSV ({rows.length})
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            aria-label="Refresh landlords"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10"
          >
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      }
    >
      {error ? (
        <ErrorBlock message={(error as Error).message} />
      ) : (
        <div className="space-y-5 pb-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total Landlords" value={counts.total} icon={UsersIcon} />
            <StatCard label="Active" value={counts.active} icon={UserCheck} tone="text-emerald-600" />
            <StatCard label="Pending" value={counts.pending} icon={UsersIcon} tone="text-amber-600" />
            <StatCard
              label="Suspended"
              value={counts.suspended}
              icon={ShieldAlert}
              tone="text-destructive"
            />
          </div>

          <section className="rounded-2xl border border-border bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
              <div className="flex min-w-[180px] flex-1 items-stretch overflow-hidden rounded-lg border border-border focus-within:border-primary">
                <span className="flex items-center bg-muted/50 px-2.5 text-muted-foreground">
                  <Search className="size-4" />
                </span>
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search name / email / phone"
                  aria-label="Search landlords"
                  className="w-full bg-background px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground/70"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                    className="flex items-center px-2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter by owner type"
                className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
              >
                <option value="all">All owner types</option>
                <option value="landlord">Landlord</option>
                <option value="agent">Agent</option>
                <option value="vendor">Vendor</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter by status"
                className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
              >
                <option value="all">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s[0]?.toUpperCase()}
                    {s.slice(1)}
                  </option>
                ))}
              </select>
              {(search || statusFilter !== "all" || typeFilter !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("all");
                    setTypeFilter("all");
                    setPage(1);
                  }}
                  className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <SortHeader label="Landlord" sortBy="name" />
                    <th className="px-3 py-2 font-semibold">Type</th>
                    <SortHeader label="Phone" sortBy="phone" />
                    <th className="px-3 py-2 text-center font-semibold">Properties</th>
                    <th className="px-3 py-2 text-center font-semibold">Units</th>
                    <th className="px-3 py-2 text-center font-semibold">Meters</th>
                    <SortHeader label="Status" sortBy="status" />
                    <SortHeader label="Created" sortBy="created_at" />
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {isLoading ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                        <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
                        Loading landlords…
                      </td>
                    </tr>
                  ) : paged.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                        {owners.length === 0
                          ? "No property owners are linked to your meters yet."
                          : "No landlords match these filters."}
                      </td>
                    </tr>
                  ) : (
                    paged.map((row) => (
                      <tr key={row.id} className="border-t border-border">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2.5">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                              {initials(row)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-semibold">{row.name ?? "—"}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {row.email ?? "—"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2">{titleCase(row.owner_type)}</td>
                        <td className="px-3 py-2">{row.phone ?? "—"}</td>
                        <td className="px-3 py-2 text-center">{row.property_count}</td>
                        <td className="px-3 py-2 text-center">{row.unit_count}</td>
                        <td className="px-3 py-2 text-center">{row.meter_count}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                              statusTone[row.status] ?? "bg-muted text-muted-foreground"
                            }`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{date(row.created_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-3 text-sm text-muted-foreground">
              <p>
                Showing {paged.length} of {rows.length} landlords
              </p>
              <div className="flex items-center gap-2">
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  aria-label="Rows per page"
                  className="rounded-lg border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
                >
                  {LIMIT_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n} / page
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  aria-label="Previous page"
                  className="inline-flex size-7 items-center justify-center rounded-md border border-border hover:bg-accent/10 disabled:opacity-40"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span className="text-xs">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  aria-label="Next page"
                  className="inline-flex size-7 items-center justify-center rounded-md border border-border hover:bg-accent/10 disabled:opacity-40"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          </section>

          {!isLoading && owners.length === 0 && (
            <EmptyState
              title="No landlords yet"
              message="Once your meters are linked to properties, their owners will appear here."
            />
          )}
        </div>
      )}
    </DashboardShell>
  );
}

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
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
      <span
        className={`flex size-10 items-center justify-center rounded-xl bg-muted ${tone ?? "text-foreground"}`}
      >
        <Icon className="size-5" />
      </span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold">{value}</p>
      </div>
    </div>
  );
}
