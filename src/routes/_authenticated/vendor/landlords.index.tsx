import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  ChevronLeft,
  ChevronRight,
  DoorOpen,
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
  assignVendorLandlordUnit,
  deleteVendorLandlord,
  listVendorLandlordUnits,
  listVendorLandlords,
  setVendorLandlordStatus,
  updateVendorLandlord,
} from "@/lib/vendor-landlords.functions";

export const Route = createFileRoute("/_authenticated/vendor/landlords/")({
  head: () => ({
    meta: [
      { title: "Landlord Management · Vendor · SmatraPay" },
      {
        name: "description",
        content:
          "Add, edit and manage the property owners behind the meters registered to your vendor account.",
      },
      { property: "og:title", content: "Landlord Management · Vendor · SmatraPay" },
      {
        property: "og:description",
        content: "Manage landlords, unit assignments and account status within your vendor scope.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorLandlordsPage,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{(error as Error).message}</p>,
});

const LIMIT_OPTIONS = [10, 25, 50, 100];

const statusTone: Record<string, string> = {
  active: "bg-emerald-500/12 text-emerald-600",
  pending: "bg-amber-500/15 text-amber-600",
  inactive: "bg-muted text-muted-foreground",
  suspended: "bg-destructive/12 text-destructive",
};

type SortKey = "name" | "phone" | "email" | "status" | "created_at" | "property_count";

export function landlordCode(id: string) {
  return `LL-${id.slice(0, 8).toUpperCase()}`;
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

function VendorLandlordsPage() {
  const access = Route.useLoaderData();
  const queryClient = useQueryClient();

  const fetchLandlords = useServerFn(listVendorLandlords);
  const fetchUnits = useServerFn(listVendorLandlordUnits);
  const saveLandlord = useServerFn(updateVendorLandlord);
  const setStatus = useServerFn(setVendorLandlordStatus);
  const archiveLandlord = useServerFn(deleteVendorLandlord);
  const assignUnit = useServerFn(assignVendorLandlordUnit);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["vendor-landlords"],
    queryFn: () => fetchLandlords(),
  });
  const { data: unitData } = useQuery({
    queryKey: ["vendor-landlord-units"],
    queryFn: () => fetchUnits(),
  });

  const [search, setSearch] = useState("");
  const [zoneFilter, setZoneFilter] = useState("all");
  const [propertyFilter, setPropertyFilter] = useState("all");
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

  const landlords = data?.landlords ?? [];
  const units = unitData?.units ?? [];
  const byId = useMemo(() => new Map(landlords.map((l) => [l.id, l])), [landlords]);

  const zoneOptions = useMemo(
    () => [...new Set(landlords.flatMap((l) => l.zone_names))].sort(),
    [landlords],
  );
  const propertyOptions = useMemo(
    () => [...new Set(units.map((u) => u.property_name).filter(Boolean) as string[])].sort(),
    [units],
  );
  const propertyOwnersByName = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const u of units) {
      if (!u.property_name || !u.occupant_id) continue;
      map.set(u.property_name, (map.get(u.property_name) ?? new Set()).add(u.occupant_id));
    }
    return map;
  }, [units]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = landlords.filter((l) => {
      if (zoneFilter !== "all" && !l.zone_names.includes(zoneFilter)) return false;
      if (propertyFilter !== "all" && !propertyOwnersByName.get(propertyFilter)?.has(l.id)) {
        return false;
      }
      if (statusFilter !== "all") {
        const deactivated = l.status !== "active";
        if (statusFilter === "active" && deactivated) return false;
        if (statusFilter === "inactive" && !deactivated) return false;
      }
      if (!term) return true;
      return [l.name, l.email, l.phone, l.id_number, landlordCode(l.id), ...l.zone_names]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });

    const key = (l: (typeof rows)[number]) =>
      sortKey === "property_count" ? l.property_count : String(l[sortKey] ?? "").toLowerCase();

    return [...rows].sort((a, b) => {
      const av = key(a);
      const bv = key(b);
      if (av === bv) return 0;
      return sortDir === "asc" ? (av > bv ? 1 : -1) : av > bv ? -1 : 1;
    });
  }, [landlords, search, zoneFilter, propertyFilter, statusFilter, sortKey, sortDir, propertyOwnersByName]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, totalPages);
  const paged = filtered.slice((current - 1) * pageSize, current * pageSize);

  const stats = useMemo(
    () => ({
      total: landlords.length,
      active: landlords.filter((l) => l.status === "active").length,
      deactivated: landlords.filter((l) => l.status !== "active").length,
      properties: landlords.reduce((s, l) => s + l.property_count, 0),
    }),
    [landlords],
  );

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["vendor-landlords"] });
    await queryClient.invalidateQueries({ queryKey: ["vendor-landlord-units"] });
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
      saveLandlord({
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
      toast.success("Landlord updated");
      await invalidate();
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignMutation = useMutation({
    mutationFn: (id: string) =>
      assignUnit({
        data: { landlord_id: id, unit_id: selectedUnit, ...(reason ? { notes: reason } : {}) },
      }),
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
      toast.success(vars.next === "active" ? "Landlord activated" : "Landlord deactivated");
      await invalidate();
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => archiveLandlord({ data: { id, ...(reason ? { reason } : {}) } }),
    onSuccess: async () => {
      toast.success("Landlord archived — history retained");
      await invalidate();
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (id: string) => {
    const l = byId.get(id);
    if (!l) return;
    setForm({
      ...splitName(l.name),
      email: l.email ?? "",
      phone: l.phone ?? "",
      id_number: l.id_number ?? "",
      address: l.address ?? "",
      status: (l.status === "active" ? "active" : "inactive") as ResidentForm["status"],
      profile_image: l.profile_image ?? "",
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
      "Landlord ID",
      "Name",
      "Phone",
      "Email",
      "ID Number",
      "Properties",
      "Assigned Units",
      "Zone",
      "Status",
      "Date Added",
    ];
    const rows = filtered.map((l) => [
      landlordCode(l.id),
      l.name ?? "",
      l.phone ?? "",
      l.email ?? "",
      l.id_number ?? "",
      l.property_count,
      l.assigned_unit_count,
      l.zone_names.join(" / "),
      l.status === "active" ? "Active" : "Deactivated",
      formatDate(l.created_at),
    ]);
    const csv = [header, ...rows]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `vendor-landlords-${new Date().toISOString().slice(0, 10)}.csv`;
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

  const activeLandlord = dialog && "id" in dialog ? byId.get(dialog.id) : null;

  return (
    <DashboardShell
      access={access}
      title="Landlord Management"
      description="Property owners within the zones served by your account"
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
            to="/vendor/landlords/new"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="size-4" /> Add Landlord
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Landlords" value={stats.total} icon={UsersIcon} />
          <StatCard label="Active" value={stats.active} icon={UserCheck} tone="text-emerald-600" />
          <StatCard
            label="Deactivated"
            value={stats.deactivated}
            icon={ShieldAlert}
            tone="text-destructive"
          />
          <StatCard label="Properties" value={stats.properties} icon={Building2} tone="text-amber-600" />
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
                  placeholder="Search by name, phone, email or landlord ID"
                  aria-label="Search landlords"
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
                {zoneOptions.map((z) => (
                  <option key={z} value={z}>
                    {z}
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
                {propertyOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
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
                    <SortHeader label="Landlord" sortBy="name" />
                    <th className="px-4 py-3 font-semibold">Landlord ID</th>
                    <SortHeader label="Phone" sortBy="phone" />
                    <SortHeader label="Email" sortBy="email" />
                    <SortHeader label="Properties" sortBy="property_count" />
                    <th className="px-4 py-3 font-semibold">Assigned units</th>
                    <th className="px-4 py-3 font-semibold">Zone</th>
                    <SortHeader label="Status" sortBy="status" />
                    <SortHeader label="Date added" sortBy="created_at" />
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                        <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
                        Loading landlords…
                      </td>
                    </tr>
                  ) : paged.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                        {landlords.length === 0
                          ? "No landlords are currently associated with your assigned zones."
                          : "No landlords match these filters."}
                      </td>
                    </tr>
                  ) : (
                    paged.map((l) => (
                      <tr key={l.id} className="border-t border-border/70">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="inline-flex size-9 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-semibold text-primary">
                              {l.profile_image ? (
                                <img
                                  src={l.profile_image}
                                  alt={l.name ? `${l.name} profile photo` : "Landlord profile photo"}
                                  className="size-full object-cover"
                                />
                              ) : (
                                initials(l.name, l.email)
                              )}
                            </span>
                            <div className="font-medium text-foreground">{l.name ?? "—"}</div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {landlordCode(l.id)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{l.phone ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{l.email ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{l.property_count}</td>
                        <td className="px-4 py-3 text-muted-foreground">{l.assigned_unit_count}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {l.zone_names.length ? l.zone_names.join(", ") : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                              statusTone[l.status] ?? "bg-muted text-muted-foreground"
                            }`}
                          >
                            {l.status === "active" ? "Active" : titleCase(l.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(l.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="relative flex items-center justify-end gap-1.5">
                            <Link
                              to="/vendor/landlords/$landlordId"
                              params={{ landlordId: l.id }}
                              aria-label="View landlord"
                              className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent/10"
                            >
                              <Eye className="size-4" />
                            </Link>
                            <button
                              type="button"
                              aria-label="Landlord actions"
                              onClick={() => setMenuFor((v) => (v === l.id ? null : l.id))}
                              className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent/10"
                            >
                              <MoreHorizontal className="size-4" />
                            </button>
                            {menuFor === l.id && (
                              <div className="absolute right-0 top-9 z-20 w-48 overflow-hidden rounded-xl border border-border bg-card text-left shadow-lg">
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent/10"
                                  onClick={() => {
                                    setMenuFor(null);
                                    openEdit(l.id);
                                  }}
                                >
                                  <Pencil className="size-4" /> Edit
                                </button>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent/10"
                                  onClick={() => {
                                    setMenuFor(null);
                                    setSelectedUnit("");
                                    setDialog({ kind: "assign", id: l.id });
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
                                      id: l.id,
                                      next: l.status === "active" ? "inactive" : "active",
                                    });
                                  }}
                                >
                                  {l.status === "active" ? (
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
                                    setDialog({ kind: "delete", id: l.id });
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

        {!isLoading && !error && landlords.length === 0 && (
          <EmptyState
            title="No landlords"
            message="No landlords are currently associated with your assigned zones. Use Add Landlord to onboard one."
          />
        )}
      </div>

      {dialog?.kind === "edit" && (
        <VendorModal title="Edit Landlord" onClose={closeDialog} wide>
          <div className="space-y-4">
            <ResidentFormFields form={form} onChange={setForm} />
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
              Assigning a unit to {activeLandlord?.name ?? "this landlord"}. Only properties and units
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
          title={dialog.next === "active" ? "Activate landlord" : "Deactivate landlord"}
          onClose={closeDialog}
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {dialog.next === "active"
                ? `${activeLandlord?.name ?? "This landlord"} will regain access to their account.`
                : `${activeLandlord?.name ?? "This landlord"}'s account will become inactive. Properties, units, payments and meter history are kept.`}
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
        <VendorModal title="Delete landlord" onClose={closeDialog}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This archives {activeLandlord?.name ?? "this landlord"}: the account is suspended and any
              live unit assignment is closed. Properties, units, payments, meters and audit history are
              kept so nothing is lost. This cannot be undone from the vendor portal.
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
                {deleteMutation.isPending && <Loader2 className="size-4 animate-spin" />} Delete landlord
              </button>
            </div>
          </div>
        </VendorModal>
      )}
    </DashboardShell>
  );
}
