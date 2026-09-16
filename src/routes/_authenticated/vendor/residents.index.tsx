import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  UserCheck,
  UserX,
  Users as UsersIcon,
  DoorOpen,
} from "lucide-react";
import { toast } from "sonner";

import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { EmptyState, ErrorBlock, formatDate, titleCase } from "@/components/vendor/VendorUI";
import { VendorModal } from "@/components/vendor/VendorModal";
import {
  ResidentFormFields,
  UnitPicker,
  emptyResidentForm,
  splitName,
  type ResidentForm,
} from "@/components/vendor/ResidentForms";
import {
  deleteVendorResident,
  listVendorAssignableUnits,
  listVendorResidents,
  setVendorResidentStatus,
  updateVendorResident,
  assignVendorResidentUnit,
} from "@/lib/vendor-residents.functions";

export const Route = createFileRoute("/_authenticated/vendor/residents/")({
  head: () => ({
    meta: [
      { title: "Resident Management · Vendor · SmatraPay" },
      {
        name: "description",
        content: "Add, edit and manage residents living in the zones served by your vendor account.",
      },
      { property: "og:title", content: "Resident Management · Vendor · SmatraPay" },
      {
        property: "og:description",
        content: "Manage residents, unit assignments and account status within your vendor scope.",
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

const statusTone: Record<string, string> = {
  active: "bg-emerald-500/12 text-emerald-600",
  pending: "bg-amber-500/15 text-amber-600",
  inactive: "bg-muted text-muted-foreground",
  suspended: "bg-destructive/12 text-destructive",
};

type SortKey = "name" | "phone" | "email" | "property" | "zone" | "status" | "created_at";

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

export function residentCode(id: string) {
  return `RES-${id.slice(0, 8).toUpperCase()}`;
}

function VendorResidentsPage() {
  const access = Route.useLoaderData();
  const queryClient = useQueryClient();

  const fetchResidents = useServerFn(listVendorResidents);
  const fetchUnits = useServerFn(listVendorAssignableUnits);
  const saveResident = useServerFn(updateVendorResident);
  const setStatus = useServerFn(setVendorResidentStatus);
  const archiveResident = useServerFn(deleteVendorResident);
  const assignUnit = useServerFn(assignVendorResidentUnit);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["vendor-residents"],
    queryFn: () => fetchResidents(),
  });
  const { data: unitData } = useQuery({
    queryKey: ["vendor-assignable-units"],
    queryFn: () => fetchUnits(),
  });

  const [search, setSearch] = useState("");
  const [zoneFilter, setZoneFilter] = useState("all");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const [dialog, setDialog] = useState<
    | null
    | { kind: "edit"; id: string }
    | { kind: "assign"; id: string }
    | { kind: "status"; id: string; next: "active" | "inactive" }
    | { kind: "delete"; id: string }
  >(null);
  const [form, setForm] = useState<ResidentForm>(emptyResidentForm);
  const [selectedUnit, setSelectedUnit] = useState("");
  const [reason, setReason] = useState("");

  const residents = data?.residents ?? [];
  const units = unitData?.units ?? [];
  const byId = useMemo(() => new Map(residents.map((r) => [r.id, r])), [residents]);

  const zoneOptions = useMemo(
    () =>
      [
        ...new Map(
          residents
            .filter((r) => r.zone_id != null)
            .map((r) => [r.zone_id as number, r.zone_name ?? ""]),
        ),
      ].sort((a, b) => a[1].localeCompare(b[1])),
    [residents],
  );
  const propertyOptions = useMemo(
    () => [...new Set(residents.map((r) => r.property_name).filter(Boolean) as string[])].sort(),
    [residents],
  );
  const unitOptions = useMemo(
    () => [...new Set(residents.map((r) => r.unit_number).filter(Boolean) as string[])].sort(),
    [residents],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = residents.filter((r) => {
      if (zoneFilter !== "all" && String(r.zone_id ?? "") !== zoneFilter) return false;
      if (propertyFilter !== "all" && r.property_name !== propertyFilter) return false;
      if (unitFilter !== "all" && r.unit_number !== unitFilter) return false;
      if (statusFilter !== "all") {
        const deactivated = r.status !== "active";
        if (statusFilter === "active" && deactivated) return false;
        if (statusFilter === "inactive" && !deactivated) return false;
      }
      if (!term) return true;
      return [
        r.name,
        r.email,
        r.phone,
        r.id_number,
        residentCode(r.id),
        r.property_name,
        r.unit_number,
        r.zone_name,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });

    const key = (r: (typeof rows)[number]) => {
      if (sortKey === "property") return (r.property_name ?? "").toLowerCase();
      if (sortKey === "zone") return (r.zone_name ?? "").toLowerCase();
      return String(r[sortKey] ?? "").toLowerCase();
    };

    return [...rows].sort((a, b) => {
      const av = key(a);
      const bv = key(b);
      if (av === bv) return 0;
      return sortDir === "asc" ? (av > bv ? 1 : -1) : av > bv ? -1 : 1;
    });
  }, [residents, search, zoneFilter, propertyFilter, unitFilter, statusFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, totalPages);
  const paged = filtered.slice((current - 1) * pageSize, current * pageSize);

  const stats = useMemo(() => {
    const unique = [...new Map(residents.map((r) => [r.id, r])).values()];
    return {
      total: unique.length,
      active: unique.filter((r) => r.status === "active").length,
      deactivated: unique.filter((r) => r.status !== "active").length,
      unassigned: unique.filter((r) => !r.unit_id).length,
    };
  }, [residents]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["vendor-residents"] });
    await queryClient.invalidateQueries({ queryKey: ["vendor-assignable-units"] });
    await queryClient.invalidateQueries({ queryKey: ["vendor-scope"] });
  };

  const closeDialog = () => {
    setDialog(null);
    setForm(emptyResidentForm);
    setSelectedUnit("");
    setReason("");
  };

  const editMutation = useMutation({
    mutationFn: (id: string) =>
      saveResident({
        data: {
          id,
          first_name: form.first_name.trim(),
          middle_name: form.middle_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          id_number: form.id_number.trim(),
          address: form.address.trim(),
          status: form.status,
          profile_image: form.profile_image || null,
        },
      }),
    onSuccess: async () => {
      toast.success("Resident updated");
      await invalidate();
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignMutation = useMutation({
    mutationFn: (id: string) =>
      assignUnit({ data: { resident_id: id, unit_id: selectedUnit, ...(reason ? { notes: reason } : {}) } }),
    onSuccess: async () => {
      toast.success("Unit assigned");
      await invalidate();
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: "active" | "inactive" }) =>
      setStatus({ data: { id, status: next, ...(reason ? { reason } : {}) } }),
    onSuccess: async (_r, vars) => {
      toast.success(vars.next === "active" ? "Resident activated" : "Resident deactivated");
      await invalidate();
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => archiveResident({ data: { id, ...(reason ? { reason } : {}) } }),
    onSuccess: async () => {
      toast.success("Resident archived — history retained");
      await invalidate();
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (id: string) => {
    const r = byId.get(id);
    if (!r) return;
    const parts = splitName(r.name);
    setForm({
      ...parts,
      email: r.email ?? "",
      phone: r.phone ?? "",
      id_number: r.id_number ?? "",
      address: r.address ?? "",
      status: (r.status === "active" ? "active" : "inactive") as ResidentForm["status"],
      profile_image: r.profile_image ?? "",
    });
    setDialog({ kind: "edit", id });
  };

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
      "Resident ID",
      "Name",
      "Phone",
      "Email",
      "ID Number",
      "Property",
      "Unit",
      "Zone",
      "Status",
      "Registered",
    ];
    const rows = filtered.map((r) => [
      residentCode(r.id),
      r.name ?? "",
      r.phone ?? "",
      r.email ?? "",
      r.id_number ?? "",
      r.property_name ?? "",
      r.unit_number ?? "",
      r.zone_name ?? "",
      r.status === "active" ? "Active" : "Deactivated",
      formatDate(r.created_at),
    ]);
    const csv = [header, ...rows]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" }));
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

  const activeResident = dialog && "id" in dialog ? byId.get(dialog.id) : null;

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
          <Link
            to="/vendor/residents/new"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="size-4" /> Add Resident
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Residents" value={stats.total} icon={UsersIcon} />
          <StatCard label="Active" value={stats.active} icon={UserCheck} tone="text-emerald-600" />
          <StatCard
            label="Deactivated"
            value={stats.deactivated}
            icon={ShieldAlert}
            tone="text-destructive"
          />
          <StatCard label="Without a unit" value={stats.unassigned} icon={DoorOpen} tone="text-amber-600" />
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
                  placeholder="Search by name, phone, email, resident ID, property or unit"
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
                {zoneOptions.map(([id, name]) => (
                  <option key={id} value={String(id)}>
                    {name}
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
                value={unitFilter}
                onChange={(e) => {
                  setUnitFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter by unit"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="all">All units</option>
                {unitOptions.map((u) => (
                  <option key={u} value={u}>
                    {u}
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
                <option value="active">Active</option>
                <option value="inactive">Deactivated</option>
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1140px] text-left text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <SortHeader label="Resident" sortBy="name" />
                    <SortHeader label="Phone" sortBy="phone" />
                    <SortHeader label="Email" sortBy="email" />
                    <th className="px-4 py-3 font-semibold">Resident ID</th>
                    <SortHeader label="Property" sortBy="property" />
                    <th className="px-4 py-3 font-semibold">Unit</th>
                    <SortHeader label="Zone" sortBy="zone" />
                    <SortHeader label="Status" sortBy="status" />
                    <SortHeader label="Registered" sortBy="created_at" />
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                        <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
                        Loading residents…
                      </td>
                    </tr>
                  ) : paged.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                        {residents.length === 0
                          ? "No residents are currently associated with your assigned zones."
                          : "No residents match these filters."}
                      </td>
                    </tr>
                  ) : (
                    paged.map((r) => (
                      <tr key={`${r.id}-${r.unit_id ?? "none"}`} className="border-t border-border/70">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="inline-flex size-9 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-semibold text-primary">
                              {r.profile_image ? (
                                <img
                                  src={r.profile_image}
                                  alt={r.name ? `${r.name} profile photo` : "Resident profile photo"}
                                  className="size-full object-cover"
                                />
                              ) : (
                                initials(r.name, r.email)
                              )}
                            </span>
                            <div className="font-medium text-foreground">{r.name ?? "—"}</div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{r.phone ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.email ?? "—"}</td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {residentCode(r.id)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{r.property_name ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.unit_number ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.zone_name ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                              statusTone[r.status] ?? "bg-muted text-muted-foreground"
                            }`}
                          >
                            {r.status === "active" ? "Active" : titleCase(r.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(r.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="relative flex items-center justify-end gap-1.5">
                            <Link
                              to="/vendor/residents/$residentId"
                              params={{ residentId: r.id }}
                              aria-label="View resident"
                              className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent/10"
                            >
                              <Eye className="size-4" />
                            </Link>
                            <button
                              type="button"
                              aria-label="Resident actions"
                              onClick={() => setMenuFor((v) => (v === r.id ? null : r.id))}
                              className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent/10"
                            >
                              <MoreHorizontal className="size-4" />
                            </button>
                            {menuFor === r.id && (
                              <div className="absolute right-0 top-9 z-20 w-48 overflow-hidden rounded-xl border border-border bg-card text-left shadow-lg">
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent/10"
                                  onClick={() => {
                                    setMenuFor(null);
                                    openEdit(r.id);
                                  }}
                                >
                                  <Pencil className="size-4" /> Edit
                                </button>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent/10"
                                  onClick={() => {
                                    setMenuFor(null);
                                    setSelectedUnit(r.unit_id ?? "");
                                    setDialog({ kind: "assign", id: r.id });
                                  }}
                                >
                                  <DoorOpen className="size-4" /> Assign unit
                                </button>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent/10"
                                  onClick={() => {
                                    setMenuFor(null);
                                    setReason("");
                                    setDialog({
                                      kind: "status",
                                      id: r.id,
                                      next: r.status === "active" ? "inactive" : "active",
                                    });
                                  }}
                                >
                                  {r.status === "active" ? (
                                    <>
                                      <UserX className="size-4" /> Deactivate
                                    </>
                                  ) : (
                                    <>
                                      <UserCheck className="size-4" /> Activate
                                    </>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                                  onClick={() => {
                                    setMenuFor(null);
                                    setReason("");
                                    setDialog({ kind: "delete", id: r.id });
                                  }}
                                >
                                  <Trash2 className="size-4" /> Delete
                                </button>
                              </div>
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
            message="No residents are currently associated with your assigned zones. Use Add Resident to onboard one."
          />
        )}
      </div>

      {dialog?.kind === "edit" && (
        <VendorModal title="Edit Resident" onClose={closeDialog} wide>
          <div className="space-y-4">
            <ResidentFormFields form={form} onChange={setForm} residentId={dialog.id} />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-outline px-4 py-2" onClick={closeDialog}>
                Cancel
              </button>
              <button
                type="button"
                disabled={editMutation.isPending}
                onClick={() => editMutation.mutate(dialog.id)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {editMutation.isPending && <Loader2 className="size-4 animate-spin" />} Save changes
              </button>
            </div>
          </div>
        </VendorModal>
      )}

      {dialog?.kind === "assign" && (
        <VendorModal title="Assign Unit" onClose={closeDialog} wide>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Assigning a unit to {activeResident?.name ?? "this resident"}. Only properties and units
              inside your vendor scope are listed.
            </p>
            <UnitPicker units={units} value={selectedUnit} onChange={setSelectedUnit} required />
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-muted-foreground">Notes (optional)</span>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-outline px-4 py-2" onClick={closeDialog}>
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedUnit || assignMutation.isPending}
                onClick={() => assignMutation.mutate(dialog.id)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {assignMutation.isPending && <Loader2 className="size-4 animate-spin" />} Assign unit
              </button>
            </div>
          </div>
        </VendorModal>
      )}

      {dialog?.kind === "status" && (
        <VendorModal
          title={dialog.next === "active" ? "Activate resident" : "Deactivate resident"}
          onClose={closeDialog}
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {dialog.next === "active"
                ? `${activeResident?.name ?? "This resident"} will regain access to their account.`
                : `${activeResident?.name ?? "This resident"}'s account will become inactive. Meter, payment and assignment history is kept.`}
            </p>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-muted-foreground">Reason (optional)</span>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-outline px-4 py-2" onClick={closeDialog}>
                Cancel
              </button>
              <button
                type="button"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate({ id: dialog.id, next: dialog.next })}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {statusMutation.isPending && <Loader2 className="size-4 animate-spin" />} Confirm
              </button>
            </div>
          </div>
        </VendorModal>
      )}

      {dialog?.kind === "delete" && (
        <VendorModal title="Delete resident" onClose={closeDialog}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This archives {activeResident?.name ?? "this resident"}: the account is suspended and any
              live unit assignment is closed. Payments, meters, assignments and audit history are kept so
              nothing is lost. This cannot be undone from the vendor portal.
            </p>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-muted-foreground">Reason (optional)</span>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-outline px-4 py-2" onClick={closeDialog}>
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(dialog.id)}
                className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-60"
              >
                {deleteMutation.isPending && <Loader2 className="size-4 animate-spin" />} Delete resident
              </button>
            </div>
          </div>
        </VendorModal>
      )}
    </DashboardShell>
  );
}
