import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  SlidersHorizontal,
  UserPlus,
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
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const DEFAULT_LIMIT = 10;
const LIMIT_OPTIONS = [10, 25, 50, 100];

function parseSearch(search: Record<string, unknown>) {
  const page = Math.max(1, Number(search["page"]) || 1);
  const limit = LIMIT_OPTIONS.includes(Number(search["limit"]))
    ? Number(search["limit"])
    : DEFAULT_LIMIT;
  return { page, limit };
}

export const Route = createFileRoute("/_authenticated/service-providers")({
  validateSearch: parseSearch,
  head: () => ({
    meta: [
      { title: "Service Provider Management · SmatraPay" },
      {
        name: "description",
        content:
          "Manage SmatraPay service provider accounts: names, usernames, emails, phones, statuses and join dates.",
      },
      { property: "og:title", content: "Service Provider Management · SmatraPay" },
      {
        property: "og:description",
        content: "View, search and manage every service provider account on SmatraPay.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ServiceProvidersPage,
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-destructive">{(error as Error).message}</div>
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
  active: "bg-accent/12 text-accent",
  pending: "bg-primary/12 text-primary",
  inactive: "bg-muted text-muted-foreground",
  suspended: "bg-destructive/12 text-destructive",
};

function date(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "—";
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

const EXPORT_COLUMNS: { key: keyof Row; label: string }[] = [
  { key: "name", label: "Full Name" },
  { key: "email", label: "Email Address" },
  { key: "username", label: "Username" },
  { key: "phone", label: "Phone Number" },
  { key: "role", label: "Portal Role" },
  { key: "status", label: "Account Status" },
  { key: "created_at", label: "Joined Date" },
];
const DEFAULT_COLUMNS = EXPORT_COLUMNS.map((column) => column.key);

function ServiceProvidersPage() {
  const fetchProviders = useServerFn(listUsersByRole);
  const [search, setSearch] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<(keyof Row)[]>(DEFAULT_COLUMNS);
  const [statusFilter, setStatusFilter] = useState("all");

  const { page: currentPage, limit: pageSize } = Route.useSearch();
  const navigate = useNavigate({ from: "/service-providers" });
  const setPage = (page: number) => navigate({ search: (prev) => ({ ...prev, page }) });
  const setPageSize = (limit: number) =>
    navigate({ search: (prev) => ({ ...prev, page: 1, limit }) });

  useEffect(() => {
    if (currentPage !== 1) setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["users", "service_provider"],
    queryFn: () => fetchProviders({ data: { role: "service_provider" } }),
  });

  const providers = useMemo(() => (data?.users ?? []) as unknown as Row[], [data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return providers.filter((r) => {
      const matchesStatus = statusFilter === "all" || r.status === statusFilter;
      if (!matchesStatus) return false;
      if (!term) return true;
      return [r.name, r.email, r.username, r.phone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [providers, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(currentPage, totalPages);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const stats = useMemo(
    () => ({
      total: providers.length,
      active: providers.filter((r) => r.status === "active").length,
      pending: providers.filter((r) => r.status === "pending").length,
      suspended: providers.filter((r) => r.status === "suspended").length,
    }),
    [providers],
  );

  const exportCsv = () => {
    const columns = EXPORT_COLUMNS.filter((column) => selectedColumns.includes(column.key));
    if (!columns.length) {
      toast.error("Pick at least one column to export");
      return;
    }
    const header = columns.map((column) => column.label);
    const rows = filtered.map((row) =>
      columns.map((column) =>
        column.key === "created_at"
          ? date(row.created_at)
          : column.key === "role"
            ? "Service Provider"
            : (row[column.key] ?? ""),
      ),
    );
    const csv = [header, ...rows]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `smatrapay-service-providers-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(
      `Exported ${filtered.length} service provider${filtered.length === 1 ? "" : "s"}`,
    );
  };

  const cards = [
    {
      label: "Total Providers",
      value: stats.total,
      icon: Briefcase,
      tone: "bg-primary/12 text-primary",
    },
    {
      label: "Active Providers",
      value: stats.active,
      icon: UserCheck,
      tone: "bg-accent/12 text-accent",
    },
    {
      label: "Pending Providers",
      value: stats.pending,
      icon: UsersIcon,
      tone: "bg-primary/12 text-primary",
    },
    {
      label: "Suspended Providers",
      value: stats.suspended,
      icon: ShieldAlert,
      tone: "bg-destructive/12 text-destructive",
    },
  ];

  const exportControls = (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild>
          <Link to="/users/new">
            <UserPlus /> Add User
          </Link>
        </Button>
        <Button
          variant="outline"
          onClick={exportCsv}
          disabled={isLoading || !!error || !filtered.length}
        >
          <Download /> Export CSV ({filtered.length})
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Choose export columns"
          title="Choose export columns"
          aria-expanded={exportOpen}
          onClick={() => setExportOpen((open) => !open)}
        >
          <SlidersHorizontal />
        </Button>
      </div>
      {exportOpen && (
        <div className="absolute right-0 z-40 mt-2 w-64 rounded-lg border border-border bg-background p-3">
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            Columns to export
          </p>
          {EXPORT_COLUMNS.map((column) => (
            <label
              key={column.key}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
            >
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={selectedColumns.includes(column.key)}
                onChange={(event) =>
                  setSelectedColumns((previous) =>
                    event.target.checked
                      ? [...previous, column.key]
                      : previous.filter((key) => key !== column.key),
                  )
                }
              />
              {column.label}
            </label>
          ))}
          <div className="mt-2 flex justify-between border-t border-border pt-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedColumns(DEFAULT_COLUMNS)}>
              Select all
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedColumns(DEFAULT_COLUMNS)}>
              Reset
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <PortalLayout
      roles={["admin"]}
      title="Service Provider Management"
      description="Manage your service provider directory"
      actions={<div className="hidden xl:block">{exportControls}</div>}
    >
      <div className="space-y-5 pt-3">
        <div className="flex justify-end xl:hidden">{exportControls}</div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <div key={card.label} className="rounded-2xl border border-border bg-card p-5">
              <span
                className={`flex size-10 items-center justify-center rounded-xl ${card.tone}`}
                aria-hidden="true"
              >
                <card.icon className="size-5" />
              </span>
              <p className="mt-4 text-3xl font-extrabold text-foreground">
                {isLoading ? "—" : card.value}
              </p>
              <p className="text-sm text-muted-foreground">{card.label}</p>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
            <div className="input-shell flex w-full max-w-sm items-center gap-2">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                className="input-field min-w-0"
                placeholder="Search providers by name, email, phone…"
                aria-label="Search service providers"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase text-muted-foreground">Role:</span>
              <span className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary">
                Service Provider
              </span>
              <select
                aria-label="Filter by status"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm capitalize"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All Status</option>
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  {[
                    "Service Provider",
                    "Username",
                    "Phone",
                    "Role",
                    "Status",
                    "Joined",
                    "Actions",
                  ].map((heading) => (
                    <th
                      key={heading}
                      className={`px-4 py-3 ${heading === "Actions" ? "text-right" : ""}`}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      Loading service providers…
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-destructive">
                      <p>{(error as Error).message}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => void refetch()}
                      >
                        Refresh
                      </Button>
                    </td>
                  </tr>
                ) : paged.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      No service providers match your filters.
                    </td>
                  </tr>
                ) : (
                  paged.map((row) => (
                    <tr key={row.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {row.profile_image ? (
                            <img
                              src={row.profile_image}
                              alt={row.name ?? "Service provider avatar"}
                              className="size-9 shrink-0 rounded-full object-cover"
                            />
                          ) : (
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                              {initials(row)}
                            </span>
                          )}
                          <div>
                            <div className="font-semibold text-foreground">{row.name || "—"}</div>
                            <div className="text-xs text-muted-foreground">{row.email || "—"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{row.username || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.phone || "—"}</td>
                      <td className="px-4 py-3 text-primary">Service Provider</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusTone[row.status] ?? "bg-muted text-muted-foreground"}`}
                        >
                          <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                          {row.status || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{date(row.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button asChild variant="ghost" size="icon">
                            <Link
                              to="/users/$id"
                              params={{ id: row.id }}
                              aria-label="View service provider"
                              title="View service provider"
                            >
                              <Eye />
                            </Link>
                          </Button>
                          <Button asChild variant="ghost" size="icon">
                            <Link
                              to="/users/$id/edit"
                              params={{ id: row.id }}
                              aria-label="Edit service provider"
                              title="Edit service provider"
                            >
                              <Pencil />
                            </Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 sm:flex-row">
            <p className="text-sm text-muted-foreground">
              Showing{" "}
              <span className="font-medium text-foreground">
                {filtered.length ? (page - 1) * pageSize + 1 : 0}
              </span>
              –
              <span className="font-medium text-foreground">
                {Math.min(page * pageSize, filtered.length)}
              </span>{" "}
              of <span className="font-medium text-foreground">{filtered.length}</span> providers
            </p>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                Rows
                <select
                  aria-label="Rows per page"
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                >
                  {LIMIT_OPTIONS.map((limit) => (
                    <option key={limit} value={limit}>
                      {limit}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Previous page"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft />
                </Button>
                <span className="min-w-[4.5rem] px-2 text-center text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{page}</span> / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Next page"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}
