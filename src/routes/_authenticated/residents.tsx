import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Pencil,
  Search,
  ShieldAlert,
  UserCheck,
  Users as UsersIcon,
} from "lucide-react";

import { listUsersByRole } from "@/lib/users.functions";
import { PortalLayout } from "@/components/PortalLayout";

const DEFAULT_LIMIT = 10;
const LIMIT_OPTIONS = [10, 25, 50, 100];

function parseSearch(search: Record<string, unknown>) {
  const page = Math.max(1, Number(search["page"]) || 1);
  const limit = LIMIT_OPTIONS.includes(Number(search["limit"]))
    ? Number(search["limit"])
    : DEFAULT_LIMIT;
  return { page, limit };
}

export const Route = createFileRoute("/_authenticated/residents")({
  validateSearch: parseSearch,
  head: () => ({
    meta: [
      { title: "Resident Management · SmatraPay" },
      {
        name: "description",
        content:
          "Manage SmatraPay resident accounts: names, usernames, emails, phones, statuses and join dates.",
      },
      { property: "og:title", content: "Resident Management · SmatraPay" },
      {
        property: "og:description",
        content: "View, search and manage every resident account on SmatraPay.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResidentsPage,
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-destructive">{error.message}</div>
  ),
});

type Row = {
  id: string;
  name: string | null;
  email: string | null;
  username: string | null;
  phone: string | null;
  profile_image: string | null;
  status: string;
  role: string;
  created_at: string;
};

const STATUSES = ["active", "pending", "inactive", "suspended"];

const statusTone: Record<string, string> = {
  active: "bg-emerald-500/12 text-emerald-600",
  pending: "bg-amber-500/15 text-amber-600",
  inactive: "bg-muted text-muted-foreground",
  suspended: "bg-destructive/12 text-destructive",
};

function date(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "";
}

function initials(row: Row) {
  const source = row.name || row.email || "?";
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function ResidentsPage() {
  const fetchResidents = useServerFn(listUsersByRole);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { page: currentPage, limit: pageSize } = Route.useSearch();
  const navigate = useNavigate({ from: "/residents" });
  const setPage = (page: number) => navigate({ search: (prev) => ({ ...prev, page }) });
  const setPageSize = (limit: number) =>
    navigate({ search: (prev) => ({ ...prev, page: 1, limit }) });

  useEffect(() => {
    if (currentPage !== 1) setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["users", "resident"],
    queryFn: () => fetchResidents({ data: { role: "resident" } }),
  });

  const residents = useMemo(() => (data?.users ?? []) as unknown as Row[], [data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return residents.filter((r) => {
      const matchesStatus = statusFilter === "all" || r.status === statusFilter;
      if (!matchesStatus) return false;
      if (!term) return true;
      return [r.name, r.email, r.username, r.phone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [residents, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(currentPage, totalPages);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const stats = useMemo(
    () => ({
      total: residents.length,
      active: residents.filter((r) => r.status === "active").length,
      pending: residents.filter((r) => r.status === "pending").length,
      suspended: residents.filter((r) => r.status === "suspended").length,
    }),
    [residents],
  );

  const exportCsv = () => {
    const header = ["Full Name", "Email", "Username", "Phone", "Status", "Joined"];
    const rows = filtered.map((r) => [
      r.name ?? "",
      r.email ?? "",
      r.username ?? "",
      r.phone ?? "",
      r.status,
      date(r.created_at),
    ]);
    const csv = [header, ...rows]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `smatrapay-residents-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PortalLayout
      roles={["admin"]}
      title="Resident Management"
      description="All resident accounts"
    >
      <div className="space-y-5">
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

        <section className="rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
            <div className="flex min-w-[220px] flex-1 items-stretch overflow-hidden rounded-lg border border-border focus-within:border-primary">
              <span className="flex items-center bg-muted/50 px-3 text-muted-foreground">
                <Search className="size-4" />
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search residents by name, email, username or phone"
                className="w-full bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/70"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="all">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s[0]?.toUpperCase()}
                  {s.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Resident</th>
                  <th className="px-4 py-3 font-semibold">Username</th>
                  <th className="px-4 py-3 font-semibold">Phone</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Joined</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      Loading residents…
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-destructive">
                      {(error as Error).message}
                    </td>
                  </tr>
                ) : paged.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      No residents found.
                    </td>
                  </tr>
                ) : (
                  paged.map((r) => (
                    <tr key={r.id} className="border-t border-border/70">
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
                              initials(r)
                            )}
                          </span>
                          <div>
                            <div className="font-medium text-foreground">{r.name ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">{r.email ?? "—"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.username ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.phone ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                            statusTone[r.status] ?? "bg-muted text-muted-foreground"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{date(r.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            to="/users/$id"
                            params={{ id: r.id }}
                            aria-label="View resident"
                            className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent/10"
                          >
                            <Eye className="size-4" />
                          </Link>
                          <Link
                            to="/users/$id/edit"
                            params={{ id: r.id }}
                            aria-label="Edit resident"
                            className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent/10"
                          >
                            <Pencil className="size-4" />
                          </Link>
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
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="rounded-lg border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
              >
                {LIMIT_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span>
                {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1}–
                {Math.min(page * pageSize, filtered.length)} of {filtered.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent/10 disabled:opacity-50"
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent/10 disabled:opacity-50"
                aria-label="Next page"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        </section>
      </div>
    </PortalLayout>
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
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className={`size-4 ${tone ?? "text-primary"}`} />
      </div>
      <div className="mt-2 text-2xl font-bold text-foreground">{value}</div>
    </div>
  );
}
