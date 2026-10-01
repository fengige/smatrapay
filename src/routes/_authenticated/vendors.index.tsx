import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  UserCheck,
  Users as UsersIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { deleteUser, listUsersByRole, updateUser } from "@/lib/users.functions";
import { PortalLayout } from "@/components/PortalLayout";

const DEFAULT_LIMIT = 10;
const LIMIT_OPTIONS = [10, 25, 50, 100];

function parseSearch(search: Record<string, unknown>) {
  const page = Math.max(1, Number(search["page"]) || 1);
  const limit = LIMIT_OPTIONS.includes(Number(search["limit"]))
    ? Number(search["limit"])
    : DEFAULT_LIMIT;
  const status =
    typeof search["status"] === "string" && STATUSES.includes(search["status"])
      ? search["status"]
      : "all";
  const q = typeof search["q"] === "string" ? search["q"] : "";
  return { page, limit, status, q };
}

export const Route = createFileRoute("/_authenticated/vendors/")({
  validateSearch: parseSearch,
  head: () => ({
    meta: [
      { title: "Vendor Management · SmatraPay" },
      {
        name: "description",
        content:
          "Manage SmatraPay vendor accounts: names, emails, phones, statuses and join dates.",
      },
      { property: "og:title", content: "Vendor Management · SmatraPay" },
      {
        property: "og:description",
        content: "View, search and manage every vendor account on SmatraPay.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VendorsPage,
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
  active: "bg-emerald-500/12 text-emerald-600",
  pending: "bg-amber-500/15 text-amber-600",
  inactive: "bg-muted text-muted-foreground",
  suspended: "bg-destructive/12 text-destructive",
};

type SortKey = "name" | "email" | "phone" | "status" | "created_at";

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

function VendorsPage() {
  const fetchVendors = useServerFn(listUsersByRole);
  const saveVendor = useServerFn(updateUser);
  const removeVendor = useServerFn(deleteUser);
  const queryClient = useQueryClient();

  const { page: currentPage, limit: pageSize, status: statusFilter, q: search } = Route.useSearch();
  const navigate = useNavigate({ from: "/vendors/" });
  const setPage = (page: number) => navigate({ search: (prev) => ({ ...prev, page }) });
  const setPageSize = (limit: number) =>
    navigate({ search: (prev) => ({ ...prev, page: 1, limit }) });
  const setStatusFilter = (status: string) =>
    navigate({ search: (prev) => ({ ...prev, page: 1, status }) });
  const setSearch = (q: string) => navigate({ search: (prev) => ({ ...prev, page: 1, q }) });

  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [confirm, setConfirm] = useState<
    { type: "status" | "delete"; row: Row; next?: string } | null
  >(null);

  useEffect(() => {
    if (currentPage !== 1) setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter]);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["users", "vendor", statusFilter, search, currentPage, pageSize, sortKey, sortDir],
    queryFn: () =>
      fetchVendors({
        data: {
          role: "vendor",
          ...(statusFilter !== "all" ? { status: statusFilter } : {}),
          ...(search.trim() ? { q: search.trim() } : {}),
          page: currentPage,
          limit: pageSize,
          sortBy: sortKey,
          sortDir,
        },
      }),
    placeholderData: (prev) => prev,
  });

  const statusMutation = useMutation({
    mutationFn: (vars: { id: string; status: string }) =>
      saveVendor({ data: { id: vars.id, status: vars.status } } as never),
    onSuccess: async (_res, vars) => {
      toast.success(vars.status === "active" ? "Vendor activated" : "Vendor deactivated");
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: Error) => toast.error(err.message || "Could not update vendor status"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeVendor({ data: { id } } as never),
    onSuccess: async () => {
      toast.success("Vendor deleted");
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: Error) => toast.error(err.message || "Could not delete vendor"),
  });

  const busy = statusMutation.isPending || deleteMutation.isPending;

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(currentPage, totalPages);
  const paged = (data?.users ?? []) as unknown as Row[];

  const toggleSort = (key: SortKey) => {
    setPage(1);
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const RowActions = ({ row }: { row: Row }) => {
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const menuId = useId();
    const triggerId = useId();
    const isActive = row.status === "active";
    const nextStatus = isActive ? "inactive" : "active";

    useEffect(() => {
      if (!open) return;
      const handle = (e: MouseEvent | KeyboardEvent) => {
        if (e.type === "keydown" && (e as KeyboardEvent).key === "Escape") {
          setOpen(false);
          return;
        }
        if (
          e.type === "mousedown" &&
          menuRef.current &&
          !menuRef.current.contains(e.target as Node)
        ) {
          setOpen(false);
        }
      };
      document.addEventListener("mousedown", handle);
      document.addEventListener("keydown", handle);
      return () => {
        document.removeEventListener("mousedown", handle);
        document.removeEventListener("keydown", handle);
      };
    }, [open]);

    return (
      <div className="flex items-center justify-end gap-1">
        <div className="hidden items-center gap-1 sm:flex">
          <Link
            to="/vendors/$id"
            params={{ id: row.id }}
            search={{ page: 1, limit: 10 }}
            aria-label="View vendor"
            className="inline-flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent/10"
          >
            <Eye className="size-3.5" />
          </Link>
          <Link
            to="/vendors/$id/edit"
            params={{ id: row.id }}
            search={{ page: 1, limit: 10 }}
            aria-label="Edit vendor"
            className="inline-flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent/10"
          >
            <Pencil className="size-3.5" />
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirm({ type: "status", row, next: nextStatus })}
            aria-label={isActive ? "Deactivate vendor" : "Activate vendor"}
            className="inline-flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent/10 disabled:opacity-50"
          >
            <Power className={`size-3.5 ${isActive ? "text-emerald-600" : ""}`} />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirm({ type: "delete", row })}
            aria-label="Delete vendor"
            className="inline-flex size-7 items-center justify-center rounded-md border border-border text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>

        <div className="relative sm:hidden" ref={menuRef}>
          <button
            type="button"
            id={triggerId}
            aria-haspopup="menu"
            aria-controls={menuId}
            aria-expanded={open}
            aria-label={`Actions for ${row.name || "vendor"}`}
            disabled={busy}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent/10 disabled:opacity-50"
          >
            <MoreVertical className="size-3.5" aria-hidden="true" />
          </button>
          {open && (
            <div
              id={menuId}
              role="menu"
              aria-labelledby={triggerId}
              className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-border bg-card p-1 shadow-lg"
            >
              <Link
                to="/vendors/$id"
                params={{ id: row.id }}
                search={{ page: 1, limit: 10 }}
                role="menuitem"
                className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-foreground hover:bg-accent/10"
                onClick={() => setOpen(false)}
              >
                <Eye className="size-3.5" aria-hidden="true" /> View
              </Link>
              <Link
                to="/vendors/$id/edit"
                params={{ id: row.id }}
                search={{ page: 1, limit: 10 }}
                role="menuitem"
                className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-foreground hover:bg-accent/10"
                onClick={() => setOpen(false)}
              >
                <Pencil className="size-3.5" aria-hidden="true" /> Edit
              </Link>
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  setConfirm({ type: "status", row, next: nextStatus });
                }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-foreground hover:bg-accent/10 disabled:opacity-50"
              >
                <Power className={`size-3.5 ${isActive ? "text-emerald-600" : ""}`} aria-hidden="true" />
                {isActive ? "Deactivate" : "Activate"}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  setConfirm({ type: "delete", row });
                }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                <Trash2 className="size-3.5" aria-hidden="true" /> Delete
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const stats = data?.counts ?? { total: 0, active: 0, pending: 0, suspended: 0 };

  const exportCsv = async () => {
    const res = await fetchVendors({
      data: {
        role: "vendor",
        ...(statusFilter !== "all" ? { status: statusFilter } : {}),
        ...(search.trim() ? { q: search.trim() } : {}),
      },
    });
    const all = [...((res.users ?? []) as unknown as Row[])].sort((a, b) => {
      const av = String(a[sortKey] ?? "").toLowerCase();
      const bv = String(b[sortKey] ?? "").toLowerCase();
      if (av === bv) return 0;
      return sortDir === "asc" ? (av > bv ? 1 : -1) : av > bv ? -1 : 1;
    });
    const header = ["Full Name", "Email", "Phone", "Status", "Joined"];
    const rows = all.map((r) => [
      r.name ?? "",
      r.email ?? "",
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
    link.download = `smatrapay-vendors-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

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
    <PortalLayout
      roles={["admin"]}
      title="Vendor Management"
      description="All vendor accounts"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/vendors/new"
            search={{ page: 1, limit: 10 }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="size-4" /> Add Vendor
          </Link>
          <button
            type="button"
            onClick={() => void exportCsv()}
            disabled={!total}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10 disabled:opacity-60"
          >
            <Download className="size-4" /> Export CSV ({total})
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            aria-label="Refresh vendors"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10"
          >
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Vendors" value={stats.total} icon={UsersIcon} />
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
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <div className="flex min-w-[180px] flex-1 items-stretch overflow-hidden rounded-lg border border-border focus-within:border-primary">
              <span className="flex items-center bg-muted/50 px-2.5 text-muted-foreground">
                <Search className="size-4" />
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name / email"
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
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
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
            {(search || statusFilter !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                }}
                className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[540px] text-left text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <SortHeader label="Vendor" sortBy="name" />
                  <SortHeader label="Phone" sortBy="phone" />
                  <SortHeader label="Status" sortBy="status" />
                  <SortHeader label="Created" sortBy="created_at" />
                  <th className="px-3 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                      <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
                      Loading vendors…
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-destructive">
                      {(error as Error).message}
                    </td>
                  </tr>
                ) : paged.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                      No vendors found. Try adjusting your search or add a new vendor.
                    </td>
                  </tr>
                ) : (
                  paged.map((r) => (
                    <tr key={r.id} className="border-t border-border/70">
                      <td className="px-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-semibold text-primary">
                            {r.profile_image ? (
                              <img
                                src={r.profile_image}
                                alt={r.name ?? "Vendor avatar"}
                                className="size-full object-cover"
                              />
                            ) : (
                              initials(r)
                            )}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate font-medium text-foreground">{r.name ?? "—"}</div>
                            <div className="truncate text-xs text-muted-foreground">{r.email ?? "—"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{r.phone ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                            statusTone[r.status] ?? "bg-muted text-muted-foreground"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{date(r.created_at)}</td>
                      <td className="px-3 py-2.5">
                        <RowActions row={r} />
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
                {total === 0 ? 0 : (page - 1) * pageSize + 1}–
                {Math.min(page * pageSize, total)} of {total}
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

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"
          >
            <h3 className="text-lg font-semibold text-foreground">
              {confirm.type === "delete" ? "Delete vendor" : "Change vendor status"}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {confirm.type === "delete" ? (
                <>
                  This permanently removes{" "}
                  <strong>{confirm.row.name ?? confirm.row.email}</strong> from vendors. This
                  action cannot be undone.
                </>
              ) : (
                <>
                  Set <strong>{confirm.row.name ?? confirm.row.email}</strong> to{" "}
                  <strong>{confirm.next}</strong>? This affects their access to the vendor portal.
                </>
              )}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (confirm.type === "delete") deleteMutation.mutate(confirm.row.id);
                  else
                    statusMutation.mutate({
                      id: confirm.row.id,
                      status: confirm.next ?? "active",
                    });
                  setConfirm(null);
                }}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60 ${
                  confirm.type === "delete" ? "bg-destructive" : "bg-primary"
                }`}
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                {confirm.type === "delete" ? "Delete" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
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
