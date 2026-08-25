import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Pencil,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  UserCheck,
  UserCog,
  UserPlus,
  Users as UsersIcon,
} from "lucide-react";

import { toast } from "sonner";
import { listUsers, updateUser, deleteUser } from "@/lib/users.functions";
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

export const Route = createFileRoute("/_authenticated/users/")({
  validateSearch: parseSearch,
  head: () => ({
    meta: [
      { title: "User Management · SmatraPay" },
      {
        name: "description",
        content:
          "Manage SmatraPay user accounts: names, usernames, emails, phones, roles, statuses and notes.",
      },
      { property: "og:title", content: "User Management · SmatraPay" },
      {
        property: "og:description",
        content: "Manage SmatraPay accounts, roles, statuses and profile details.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: UsersPage,
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-destructive">{error.message}</div>
  ),
});

type Row = {
  id: string;
  name: string | null;
  email: string | null;
  email_verified_at: string | null;
  username: string | null;
  phone: string | null;
  profile_image: string | null;
  bio: string | null;
  notes: string | null;
  status: string;
  role: string;
  created_at: string;
  updated_at: string;
};

const statuses = ["active", "inactive", "suspended", "pending"];
const roles = [
  "admin",
  "landlord",
  "vendor",
  "agent",
  "service_provider",
  "resident",
  "moderator",
  "user",
];

const statusTone: Record<string, string> = {
  active: "bg-emerald-500/12 text-emerald-600",
  pending: "bg-amber-500/15 text-amber-600",
  inactive: "bg-muted text-muted-foreground",
  suspended: "bg-destructive/12 text-destructive",
};

function pretty(value: string) {
  return value.replace(/_/g, " ");
}

function date(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "";
}

const EXPORT_COLUMNS: { key: string; label: string; value: (u: Row) => string }[] = [
  { key: "name", label: "Full Name", value: (u) => u.name ?? "" },
  { key: "email", label: "Email Address", value: (u) => u.email ?? "" },
  { key: "username", label: "Username", value: (u) => u.username ?? "" },
  { key: "phone", label: "Phone Number", value: (u) => u.phone ?? "" },
  { key: "role", label: "Portal Role", value: (u) => pretty(u.role) },
  { key: "status", label: "Account Status", value: (u) => u.status },
  {
    key: "email_verified_at",
    label: "Email Verified",
    value: (u) => (u.email_verified_at ? "Yes" : "No"),
  },
  { key: "bio", label: "Bio", value: (u) => u.bio ?? "" },
  { key: "notes", label: "Internal Notes", value: (u) => u.notes ?? "" },
  { key: "created_at", label: "Joined Date", value: (u) => date(u.created_at) },
  { key: "updated_at", label: "Last Updated", value: (u) => date(u.updated_at) },
];

const DEFAULT_COLUMNS = ["name", "email", "username", "phone", "role", "status", "created_at"];

function UsersPage() {
  const queryClient = useQueryClient();
  const fetchUsers = useServerFn(listUsers);
  const saveUser = useServerFn(updateUser);
  const removeUser = useServerFn(deleteUser);
  const [editing, setEditing] = useState<Row | null>(null);
  const [viewing, setViewing] = useState<Row | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedColumns, setSelectedColumns] = useState<string[]>(DEFAULT_COLUMNS);
  const [exportOpen, setExportOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkRole, setBulkRole] = useState("");

  const { page: currentPage, limit: pageSize } = Route.useSearch();
  const navigate = useNavigate({ from: "/users/" });

  const setPage = (page: number) => navigate({ search: (prev) => ({ ...prev, page }) });
  const setPageSize = (limit: number) => navigate({ search: (prev) => ({ ...prev, page: 1, limit }) });

  // Reset to page 1 whenever filters change so results don't disappear.
  useEffect(() => {
    setSelectedIds([]);
    if (currentPage !== 1) setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter]);

  const { data, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => fetchUsers(),
  });

  const saveMutation = useMutation({
    mutationFn: (row: Row) =>
      saveUser({
        data: {
          id: row.id,
          name: row.name,
          username: row.username,
          email: row.email,
          phone: row.phone,
          profile_image: row.profile_image,
          bio: row.bio,
          notes: row.notes,
          status: row.status as "active",
          ...(data?.isAdmin ? { role: row.role as "user" } : {}),
        },
      }),
    onSuccess: () => {
      toast.success("Saved");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeUser({ data: { id } }),
    onSuccess: () => {
      toast.success("User removed");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkMutation = useMutation({
    mutationFn: async (action: { type: "status"; value: string } | { type: "role"; value: string } | { type: "delete" }) => {
      for (const id of selectedIds) {
        if (action.type === "delete") {
          await removeUser({ data: { id } });
        } else if (action.type === "status") {
          await saveUser({ data: { id, status: action.value as "active" } });
        } else {
          await saveUser({ data: { id, role: action.value as "user" } });
        }
      }
      return selectedIds.length;
    },
    onSuccess: (count) => {
      toast.success(`Updated ${count} user${count === 1 ? "" : "s"}`);
      setSelectedIds([]);
      setBulkRole("");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const users = (data?.users ?? []) as Row[];


  const stats = useMemo(
    () => ({
      total: users.length,
      active: users.filter((u) => u.status === "active").length,
      pending: users.filter((u) => u.status === "pending").length,
      suspended: users.filter((u) => u.status === "suspended" || u.status === "inactive").length,
    }),
    [users],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((u) => {
      const matchesTerm =
        !term ||
        [u.name, u.email, u.username, u.phone].some((v) => (v ?? "").toLowerCase().includes(term));
      const matchesStatus = statusFilter === "all" || u.status === statusFilter;
      return matchesTerm && matchesStatus;
    });
  }, [users, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filtered.length);
  const paginated = useMemo(
    () => filtered.slice(startIndex, endIndex),
    [filtered, startIndex, endIndex],
  );

  const allSelected = paginated.length > 0 && paginated.every((u) => selectedIds.includes(u.id));

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? paginated.map((u) => u.id) : []);
  }

  function toggleOne(id: string, checked: boolean) {
    setSelectedIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  }



  function exportCsv() {
    const cols = EXPORT_COLUMNS.filter((c) => selectedColumns.includes(c.key));
    if (cols.length === 0) {
      toast.error("Pick at least one column to export");
      return;
    }
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = filtered.map((u) => cols.map((c) => escape(c.value(u))).join(","));
    const csv = [cols.map((c) => escape(c.label)).join(","), ...rows].join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const parts = [
      "smatrapay-admins",
      statusFilter !== "all" ? statusFilter : null,
      search.trim() ? "search" : null,
      new Date().toISOString().slice(0, 10),
    ].filter(Boolean);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${parts.join("-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} user${filtered.length === 1 ? "" : "s"}`);
  }


  const cards = [
    { label: "Total Admins", value: stats.total, icon: UsersIcon, tone: "bg-primary/12 text-primary" },
    {
      label: "Active Admins",
      value: stats.active,
      icon: UserCheck,
      tone: "bg-emerald-500/12 text-emerald-600",
    },
    { label: "Pending Admins", value: stats.pending, icon: UserCog, tone: "bg-amber-500/15 text-amber-600" },
    {
      label: "Suspended Admins",
      value: stats.suspended,
      icon: ShieldAlert,
      tone: "bg-destructive/12 text-destructive",
    },
  ];

  return (
    <PortalLayout
      roles={data?.isAdmin ? ["admin"] : ["user"]}
      title="User Management"
      description="Manage your platform user directory"
      actions={
        <div className="relative">
          <div className="flex items-center gap-2">
            <Link
              to="/users/new"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              <UserPlus className="size-4" /> Add User
            </Link>
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent/10"
              onClick={exportCsv}
            >
              <Download className="size-4" /> Export CSV ({filtered.length})
            </button>
            <button
              aria-label="Choose export columns"
              aria-expanded={exportOpen}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-2 text-sm text-muted-foreground hover:bg-accent/10"
              onClick={() => setExportOpen((v) => !v)}
            >
              <SlidersHorizontal className="size-4" />
              <ChevronDown className="size-3" />
            </button>
          </div>

          {exportOpen && (
            <div className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-border bg-background p-3 shadow-lg">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Columns to export
              </p>
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {EXPORT_COLUMNS.map((c) => (
                  <label
                    key={c.key}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={selectedColumns.includes(c.key)}
                      onChange={(e) =>
                        setSelectedColumns((prev) =>
                          e.target.checked
                            ? [...prev, c.key]
                            : prev.filter((k) => k !== c.key),
                        )
                      }
                    />
                    {c.label}
                  </label>
                ))}
              </div>
              <div className="mt-2 flex justify-between border-t border-border pt-2 text-xs">
                <button
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setSelectedColumns(EXPORT_COLUMNS.map((c) => c.key))}
                >
                  Select all
                </button>
                <button
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setSelectedColumns(DEFAULT_COLUMNS)}
                >
                  Reset
                </button>
              </div>
            </div>
          )}
        </div>
      }

    >
      <div className="space-y-5">
        {!data?.isAdmin && !isLoading && (
          <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            Admin access is required to view this directory.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((c) => (
            <div key={c.label} className="rounded-2xl border border-border bg-card p-5">
              <span
                className={`flex size-10 items-center justify-center rounded-xl ${c.tone}`}
                aria-hidden
              >
                <c.icon className="size-5" />
              </span>
              <p className="mt-4 text-3xl font-extrabold tracking-tight text-foreground">
                {c.value}
              </p>
              <p className="text-sm text-muted-foreground">{c.label}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-card">
          <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
            <div className="input-shell flex max-w-sm items-center gap-2">
              <Search className="size-4 text-muted-foreground" />
              <input
                className="input-field"
                placeholder="Search by name, email, phone…"
                aria-label="Search users"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <select
                aria-label="Filter by role"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm capitalize"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="all">All Roles</option>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {pretty(r)}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filter by status"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm capitalize"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Status</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {data?.isAdmin && selectedIds.length > 0 && (
            <div className="flex flex-col gap-3 border-b border-border bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium text-foreground">
                {selectedIds.length} selected
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent/10 disabled:opacity-50"
                  disabled={bulkMutation.isPending}
                  onClick={() => bulkMutation.mutate({ type: "status", value: "active" })}
                >
                  Enable
                </button>
                <button
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent/10 disabled:opacity-50"
                  disabled={bulkMutation.isPending}
                  onClick={() => bulkMutation.mutate({ type: "status", value: "inactive" })}
                >
                  Disable
                </button>
                <select
                  aria-label="Change role for selected users"
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm capitalize"
                  value={bulkRole}
                  disabled={bulkMutation.isPending}
                  onChange={(e) => {
                    const value = e.target.value;
                    setBulkRole(value);
                    if (value) bulkMutation.mutate({ type: "role", value });
                  }}
                >
                  <option value="">Change role…</option>
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {pretty(r)}
                    </option>
                  ))}
                </select>
                <button
                  className="rounded-lg border border-destructive/40 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  disabled={bulkMutation.isPending}
                  onClick={() => {
                    if (confirm(`Delete ${selectedIds.length} user record(s)?`))
                      bulkMutation.mutate({ type: "delete" });
                  }}
                >
                  Delete
                </button>
                <button
                  className="px-2 text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => setSelectedIds([])}
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading users…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    {data?.isAdmin && (
                      <th className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label="Select all users"
                          className="size-4 accent-primary"
                          checked={allSelected}
                          onChange={(e) => toggleAll(e.target.checked)}
                        />
                      </th>
                    )}
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Username</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Joined</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((u) => (
                    <tr key={u.id} className="border-t border-border hover:bg-muted/30">
                      {data?.isAdmin && (
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            aria-label={`Select ${u.name ?? u.email ?? "user"}`}
                            className="size-4 accent-primary"
                            checked={selectedIds.includes(u.id)}
                            onChange={(e) => toggleOne(u.id, e.target.checked)}
                          />
                        </td>
                      )}
                      <td className="px-4 py-3">

                        <div className="flex items-center gap-3">
                          {u.profile_image ? (
                            <img
                              src={u.profile_image}
                              alt={u.name ?? "User avatar"}
                              className="size-9 rounded-full object-cover"
                            />
                          ) : (
                            <span className="flex size-9 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                              {(u.name ?? u.email ?? "?").charAt(0).toUpperCase()}
                            </span>
                          )}
                          <div>
                            <div className="font-semibold text-foreground">{u.name ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">{u.email ?? "—"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{u.username ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.phone ?? "—"}</td>
                      <td className="px-4 py-3 capitalize text-primary">{pretty(u.role)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
                            statusTone[u.status] ?? "bg-muted text-muted-foreground"
                          }`}
                        >
                          <span className="size-1.5 rounded-full bg-current" aria-hidden />
                          {u.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Link
                            to="/users/$id"
                            params={{ id: u.id }}
                            aria-label="View user"
                            className="rounded-md p-2 text-muted-foreground hover:bg-accent/10 hover:text-foreground"
                          >
                            <Eye className="size-4" />
                          </Link>
                          <button
                            aria-label="Edit user"
                            className="rounded-md p-2 text-muted-foreground hover:bg-accent/10 hover:text-foreground"
                            onClick={() => setEditing(u)}
                          >
                            <Pencil className="size-4" />
                          </button>
                          {data?.isAdmin && (
                            <button
                              aria-label="Delete user"
                              className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => {
                                if (confirm("Remove this user record?"))
                                  deleteMutation.mutate(u.id);
                              }}
                            >
                              <Trash2 className="size-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paginated.length === 0 && (
                    <tr>
                      <td colSpan={data?.isAdmin ? 8 : 7} className="px-4 py-10 text-center text-muted-foreground">
                        No users match your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {filtered.length > 0 && (
            <div className="flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 sm:flex-row">
              <p className="text-sm text-muted-foreground">
                Showing <span className="font-medium text-foreground">{startIndex + 1}</span>–
                <span className="font-medium text-foreground">{endIndex}</span> of{" "}
                <span className="font-medium text-foreground">{filtered.length}</span> users
              </p>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <span>Rows</span>
                  <select
                    aria-label="Rows per page"
                    className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                  >
                    {LIMIT_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    aria-label="Previous page"
                    className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-accent/10 hover:text-foreground disabled:opacity-40"
                    disabled={safePage <= 1}
                    onClick={() => setPage(safePage - 1)}
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <span className="min-w-[4.5rem] px-2 text-center text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{safePage}</span> / {totalPages}
                  </span>
                  <button
                    aria-label="Next page"
                    className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-accent/10 hover:text-foreground disabled:opacity-40"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage(safePage + 1)}
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-background p-6">
            <h2 className="text-lg font-bold text-foreground">{viewing.name ?? "User"}</h2>
            <dl className="mt-4 space-y-2 text-sm">
              {(
                [
                  ["Email", viewing.email],
                  ["Username", viewing.username],
                  ["Phone", viewing.phone],
                  ["Role", pretty(viewing.role)],
                  ["Status", viewing.status],
                  ["Verified", viewing.email_verified_at ? "Yes" : "No"],
                  ["Bio", viewing.bio],
                  ["Notes", viewing.notes],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right font-medium text-foreground">{value || "—"}</dd>
                </div>
              ))}
            </dl>
            <div className="flex justify-end pt-5">
              <button className="btn-outline" onClick={() => setViewing(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-background p-6">
            <h2 className="text-lg font-bold text-foreground">Edit user</h2>
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                saveMutation.mutate(editing);
              }}
            >
              {(
                [
                  ["Name", "name"],
                  ["Username", "username"],
                  ["Email", "email"],
                  ["Phone", "phone"],
                  ["Profile image URL", "profile_image"],
                ] as const
              ).map(([label, key]) => (
                <div key={key}>
                  <label className="field-label" htmlFor={key}>
                    {label}
                  </label>
                  <div className="input-shell">
                    <input
                      id={key}
                      className="input-field"
                      value={editing[key] ?? ""}
                      onChange={(e) => setEditing({ ...editing, [key]: e.target.value })}
                    />
                  </div>
                </div>
              ))}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label" htmlFor="status">
                    Status
                  </label>
                  <select
                    id="status"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={editing.status}
                    onChange={(e) => setEditing({ ...editing, status: e.target.value })}
                  >
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="role">
                    Role
                  </label>
                  <select
                    id="role"
                    disabled={!data?.isAdmin}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
                    value={editing.role}
                    onChange={(e) => setEditing({ ...editing, role: e.target.value })}
                  >
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="field-label" htmlFor="bio">
                  Bio
                </label>
                <textarea
                  id="bio"
                  rows={2}
                  maxLength={1000}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={editing.bio ?? ""}
                  onChange={(e) => setEditing({ ...editing, bio: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="notes">
                  Notes
                </label>
                <textarea
                  id="notes"
                  rows={2}
                  maxLength={2000}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={editing.notes ?? ""}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn-outline" onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
