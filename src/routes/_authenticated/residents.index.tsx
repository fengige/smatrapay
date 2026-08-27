import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Search,
  ShieldAlert,
  Home,
  Trash2,
  UserCheck,
  Users as UsersIcon,
} from "lucide-react";
import { toast } from "sonner";

import { deleteUser, listUsersByRole, updateUser } from "@/lib/users.functions";
import { assignUnit, endAssignment, listProperties } from "@/lib/properties.functions";
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

export const Route = createFileRoute("/_authenticated/residents/")({
  validateSearch: parseSearch,
  head: () => ({
    meta: [
      { title: "Resident Management · SmatraPay" },
      {
        name: "description",
        content:
          "Manage SmatraPay resident accounts: names, emails, phones, properties, units, statuses and join dates.",
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

type Assignment = {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string | null;
  unit: {
    unit_number: string;
    property: { name: string } | null;
  } | null;
};

type Row = {
  id: string;
  name: string | null;
  email: string | null;
  username: string | null;
  phone: string | null;
  status: string;
  role: string;
  created_at: string;
  profile_image: string | null;
  assignments: Assignment[];
};

const STATUSES = ["active", "pending", "inactive", "suspended"];

const statusTone: Record<string, string> = {
  active: "bg-emerald-500/12 text-emerald-600",
  pending: "bg-amber-500/15 text-amber-600",
  inactive: "bg-muted text-muted-foreground",
  suspended: "bg-destructive/12 text-destructive",
};

type SortKey = "name" | "email" | "phone" | "property" | "status" | "created_at";

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

function currentAssignments(row: Row) {
  return row.assignments.filter((a) => !a.end_date);
}

function assignmentDisplayString(row: Row) {
  const active = currentAssignments(row);
  if (!active.length) return null;
  const properties = [...new Set(active.map((a) => a.unit?.property?.name).filter(Boolean))];
  const units = active.map((a) => a.unit?.unit_number).filter(Boolean);
  return { properties, units };
}

function ResidentsPage() {
  const fetchResidents = useServerFn(listUsersByRole);
  const saveResident = useServerFn(updateUser);
  const removeResident = useServerFn(deleteUser);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [confirm, setConfirm] = useState<
    { type: "status" | "delete"; row: Row; next?: string } | null
  >(null);
  const [assignRow, setAssignRow] = useState<Row | null>(null);

  const { page: currentPage, limit: pageSize } = Route.useSearch();
  const navigate = useNavigate({ from: "/residents/" });
  const setPage = (page: number) => navigate({ search: (prev) => ({ ...prev, page }) });
  const setPageSize = (limit: number) =>
    navigate({ search: (prev) => ({ ...prev, page: 1, limit }) });

  useEffect(() => {
    if (currentPage !== 1) setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, propertyFilter, unitFilter]);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["users", "resident"],
    queryFn: () => fetchResidents({ data: { role: "resident" } }),
  });

  const residents = useMemo(() => (data?.users ?? []) as unknown as Row[], [data]);

  const statusMutation = useMutation({
    mutationFn: (vars: { id: string; status: string }) =>
      saveResident({ data: { id: vars.id, status: vars.status } } as never),
    onSuccess: async (_res, vars) => {
      toast.success(vars.status === "active" ? "Resident activated" : "Resident deactivated");
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: Error) => toast.error(err.message || "Could not update resident status"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeResident({ data: { id } } as never),
    onSuccess: async () => {
      toast.success("Resident deleted");
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: Error) => toast.error(err.message || "Could not delete resident"),
  });

  const busy = statusMutation.isPending || deleteMutation.isPending;

  const propertyOptions = useMemo(() => {
    const names = new Set<string>();
    for (const r of residents)
      for (const a of currentAssignments(r)) {
        const name = a.unit?.property?.name;
        if (name) names.add(name);
      }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [residents]);

  const unitOptions = useMemo(() => {
    const units = new Set<string>();
    for (const r of residents)
      for (const a of currentAssignments(r)) {
        if (propertyFilter !== "all" && a.unit?.property?.name !== propertyFilter) continue;
        if (a.unit?.unit_number) units.add(a.unit.unit_number);
      }
    return [...units].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [residents, propertyFilter]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = residents.filter((r) => {
      const matchesStatus = statusFilter === "all" || r.status === statusFilter;
      if (!matchesStatus) return false;
      const active = currentAssignments(r);
      if (propertyFilter !== "all") {
        const has = active.some((a) => a.unit?.property?.name === propertyFilter);
        if (!has) return false;
      }
      if (unitFilter !== "all") {
        const has = active.some(
          (a) =>
            a.unit?.unit_number === unitFilter &&
            (propertyFilter === "all" || a.unit?.property?.name === propertyFilter),
        );
        if (!has) return false;
      }
      if (!term) return true;
      const display = assignmentDisplayString(r);
      const searchValues = [
        r.name,
        r.email,
        r.username,
        r.phone,
        ...(display?.properties ?? []),
        ...(display?.units ?? []),
      ];
      return searchValues
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });

    return [...rows].sort((a, b) => {
      let av: string;
      let bv: string;
      if (sortKey === "property") {
        av = (assignmentDisplayString(a)?.properties ?? []).join(", ") ?? "";
        bv = (assignmentDisplayString(b)?.properties ?? []).join(", ") ?? "";
      } else {
        av = String(a[sortKey] ?? "").toLowerCase();
        bv = String(b[sortKey] ?? "").toLowerCase();
      }
      if (av === bv) return 0;
      return sortDir === "asc" ? (av > bv ? 1 : -1) : av > bv ? -1 : 1;
    });
  }, [residents, search, statusFilter, propertyFilter, unitFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(currentPage, totalPages);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

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
    const header = ["Full Name", "Email", "Phone", "My Property", "Status", "Joined"];
    const rows = filtered.map((r) => {
      const display = assignmentDisplayString(r);
      const myProperty = display
        ? display.properties
            .map((p, i) => (display.units[i] ? `${p} · Unit ${display.units[i]}` : p))
            .join("; ")
        : "";
      return [
        r.name ?? "",
        r.email ?? "",
        r.phone ?? "",
        myProperty,
        r.status,
        date(r.created_at),
      ];
    });
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
    <PortalLayout
      roles={["admin"]}
      title="Resident Management"
      description="All resident accounts"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/residents/new"
            search={{ page: 1, limit: 10 }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="size-4" /> Add Resident
          </Link>
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
            aria-label="Refresh residents"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10"
          >
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      }
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
                placeholder="Search residents by name, email, phone, property or unit"
                className="w-full bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/70"
              />
            </div>
            <select
              value={propertyFilter}
              onChange={(e) => {
                setPropertyFilter(e.target.value);
                setUnitFilter("all");
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
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              aria-label="Filter by unit"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="all">All units</option>
              {unitOptions.map((unit) => (
                <option key={unit} value={unit}>
                  Unit {unit}
                </option>
              ))}
            </select>
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
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <SortHeader label="Resident" sortBy="name" />
                  <SortHeader label="Phone" sortBy="phone" />
                  <SortHeader label="My Property" sortBy="property" />
                  <SortHeader label="Status" sortBy="status" />
                  <SortHeader label="Created" sortBy="created_at" />
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
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
                      No residents found. Try adjusting your search or add a new resident.
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
                      <td className="px-4 py-3 text-muted-foreground">{r.phone ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {(() => {
                          const display = assignmentDisplayString(r);
                          if (!display) return "—";
                          return (
                            <div className="space-y-1">
                              {display.properties.map((p, i) => (
                                <div key={p}>
                                  {p}
                                  {display.units[i] ? ` · Unit ${display.units[i]}` : ""}
                                </div>
                              ))}
                            </div>
                          );
                        })()}
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
                      <td className="px-4 py-3 text-muted-foreground">{date(r.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            to="/residents/$id"
                            params={{ id: r.id }}
                            search={{ page: 1, limit: 10 }}
                            aria-label="View resident"
                            className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent/10"
                          >
                            <Eye className="size-4" />
                          </Link>
                          <Link
                            to="/residents/$id/edit"
                            params={{ id: r.id }}
                            search={{ page: 1, limit: 10 }}
                            aria-label="Edit resident"
                            className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent/10"
                          >
                            <Pencil className="size-4" />
                          </Link>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setAssignRow(r)}
                            aria-label="Change unit assignment"
                            title="Change unit assignment"
                            className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent/10 disabled:opacity-50"
                          >
                            <Home className="size-4" />
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              setConfirm({
                                type: "status",
                                row: r,
                                next: r.status === "active" ? "inactive" : "active",
                              })
                            }
                            aria-label={r.status === "active" ? "Deactivate resident" : "Activate resident"}
                            className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent/10 disabled:opacity-50"
                          >
                            <Power
                              className={`size-4 ${r.status === "active" ? "text-emerald-600" : ""}`}
                            />
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setConfirm({ type: "delete", row: r })}
                            aria-label="Delete resident"
                            className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-destructive hover:bg-destructive/10 disabled:opacity-50"
                          >
                            <Trash2 className="size-4" />
                          </button>
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

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"
          >
            <h3 className="text-lg font-semibold text-foreground">
              {confirm.type === "delete" ? "Delete resident" : "Change resident status"}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {confirm.type === "delete" ? (
                <>
                  This permanently removes{" "}
                  <strong>{confirm.row.name ?? confirm.row.email}</strong> from residents. This
                  action cannot be undone.
                </>
              ) : (
                <>
                  Set <strong>{confirm.row.name ?? confirm.row.email}</strong> to{" "}
                  <strong>{confirm.next}</strong>? This affects their access to the resident portal.
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

      {assignRow && (
        <AssignUnitDialog
          row={assignRow}
          onClose={() => setAssignRow(null)}
          onSaved={async () => {
            setAssignRow(null);
            await queryClient.invalidateQueries({ queryKey: ["users"] });
            await queryClient.invalidateQueries({ queryKey: ["properties"] });
          }}
        />
      )}
    </PortalLayout>
  );
}

function AssignUnitDialog({
  row,
  onClose,
  onSaved,
}: {
  row: Row;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const fetchProperties = useServerFn(listProperties);
  const assign = useServerFn(assignUnit);
  const endAssign = useServerFn(endAssignment);

  const active = row.assignments.find((a) => !a.end_date) ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ["properties"],
    queryFn: () => fetchProperties(),
  });

  const properties = (data?.properties ?? []) as { id: string; name: string }[];
  const units = (data?.units ?? []) as {
    id: string;
    property_id: string;
    unit_number: string;
    status: string;
  }[];
  const assignments = (data?.assignments ?? []) as {
    unit_id: string;
    user_id: string;
    role: string;
    end_date: string | null;
  }[];

  const currentUnit = active
    ? units.find(
        (u) =>
          u.unit_number === active.unit?.unit_number &&
          properties.find((p) => p.id === u.property_id)?.name === active.unit?.property?.name,
      )
    : undefined;

  const [propertyId, setPropertyId] = useState(currentUnit?.property_id ?? "");
  const [unitId, setUnitId] = useState(currentUnit?.id ?? "");

  useEffect(() => {
    if (currentUnit && !propertyId) {
      setPropertyId(currentUnit.property_id);
      setUnitId(currentUnit.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUnit?.id]);

  const takenByOthers = useMemo(
    () =>
      new Set(
        assignments
          .filter((a) => a.role === "resident" && !a.end_date && a.user_id !== row.id)
          .map((a) => a.unit_id),
      ),
    [assignments, row.id],
  );

  const unitChoices = units.filter((u) => u.property_id === propertyId);

  const mutation = useMutation({
    mutationFn: async () => {
      if (unitId === (currentUnit?.id ?? "")) return;
      if (unitId) {
        await assign({
          data: {
            unit_id: unitId,
            user_id: row.id,
            role: "resident",
            ...(active ? { replace_assignment_id: active.id } : {}),
          },
        } as never);
      } else if (active) {
        await endAssign({ data: { id: active.id } });
      }
    },
    onSuccess: async () => {
      toast.success(
        unitId ? "Unit assignment updated" : "Resident unassigned from their unit",
      );
      await onSaved();
    },
    onError: (err: Error) => toast.error(err.message || "Could not update the unit assignment"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Change unit assignment"
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"
      >
        <h3 className="text-lg font-semibold">Change unit assignment</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {row.name ?? row.email} — currently{" "}
          {active?.unit
            ? `${active.unit.property?.name ?? "—"} · Unit ${active.unit.unit_number}`
            : "unassigned"}
          .
        </p>

        {isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading properties…
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Property</span>
              <select
                value={propertyId}
                onChange={(e) => {
                  setPropertyId(e.target.value);
                  setUnitId("");
                }}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              >
                <option value="">No property</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Unit</span>
              <select
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                disabled={!propertyId}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm disabled:opacity-50"
              >
                <option value="">No unit (unassign)</option>
                {unitChoices.map((u) => {
                  const taken = takenByOthers.has(u.id);
                  return (
                    <option key={u.id} value={u.id} disabled={taken}>
                      Unit {u.unit_number} · {u.status}
                      {taken ? " · occupied by another resident" : ""}
                    </option>
                  );
                })}
              </select>
            </label>

            {active && unitId && unitId !== currentUnit?.id && (
              <p className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-600">
                Saving ends the current assignment and moves this resident to the selected unit.
              </p>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={mutation.isPending || isLoading}
            onClick={() => mutation.mutate()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Save assignment
          </button>
        </div>
      </div>
    </div>
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
