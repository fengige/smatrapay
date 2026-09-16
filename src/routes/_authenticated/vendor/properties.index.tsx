import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpDown, Building2, Download, Plus, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import {
  deleteVendorProperty,
  listVendorProperties,
  listVendorPropertyOptions,
  setVendorPropertyStatus,
  updateVendorProperty,
} from "@/lib/vendor-properties.functions";
import { VendorModal } from "@/components/vendor/VendorModal";
import {
  emptyPropertyForm,
  PropertyFormFields,
  propertyPayload,
  type PropertyFormState,
} from "@/components/vendor/PropertyForm";
import {
  downloadCsv,
  EmptyState,
  ErrorBlock,
  formatDate,
  LoadingBlock,
  Pagination,
  StatCard,
  StatusBadge,
  titleCase,
} from "@/components/vendor/VendorUI";

export const Route = createFileRoute("/_authenticated/vendor/properties/")({
  head: () => ({
    meta: [
      { title: "Property Management · Vendor · SmatraPay" },
      {
        name: "description",
        content: "Add, edit and manage the properties inside your assigned zones.",
      },
      { property: "og:title", content: "Property Management · Vendor · SmatraPay" },
      {
        property: "og:description",
        content: "Properties, units and residents inside your assigned zones.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorProperties,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{error.message}</p>,
});

const LIMIT_OPTIONS = [10, 25, 50, 100];

type SortKey =
  | "name"
  | "property_type"
  | "owner_name"
  | "zone_name"
  | "unit_count"
  | "occupied_units"
  | "status"
  | "created_at";

function VendorProperties() {
  const access = Route.useLoaderData();
  const queryClient = useQueryClient();
  const fetchProperties = useServerFn(listVendorProperties);
  const fetchOptions = useServerFn(listVendorPropertyOptions);
  const updateFn = useServerFn(updateVendorProperty);
  const statusFn = useServerFn(setVendorPropertyStatus);
  const archiveFn = useServerFn(deleteVendorProperty);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["vendor-properties"],
    queryFn: () => fetchProperties(),
  });
  const options = useQuery({
    queryKey: ["vendor-property-options"],
    queryFn: () => fetchOptions(),
  });

  const [q, setQ] = useState("");
  const [zone, setZone] = useState("all");
  const [propertyType, setPropertyType] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [dialog, setDialog] = useState<
    | { mode: "edit"; id: string }
    | { mode: "status"; id: string; name: string; next: "active" | "archived" }
    | { mode: "archive"; id: string; name: string }
    | null
  >(null);
  const [form, setForm] = useState<PropertyFormState>(emptyPropertyForm);
  const [reason, setReason] = useState("");

  const properties = data?.properties ?? [];

  const zones = useMemo(
    () => [...new Set(properties.map((p) => p.zone_name).filter(Boolean))] as string[],
    [properties],
  );
  const types = useMemo(
    () => [...new Set(properties.map((p) => p.property_type).filter(Boolean))],
    [properties],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = properties.filter((p) => {
      if (zone !== "all" && p.zone_name !== zone) return false;
      if (propertyType !== "all" && p.property_type !== propertyType) return false;
      if (status !== "all" && p.status !== status) return false;
      if (!needle) return true;
      return [p.name, p.code, p.owner_name, p.address, p.zone_name, p.id]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [properties, q, zone, propertyType, status, sortKey, sortDir]);

  const total = rows.length;
  const start = (page - 1) * pageSize;
  const visible = rows.slice(start, start + pageSize);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["vendor-properties"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = propertyPayload(form);
      if (!payload.name) throw new Error("Property name is required");
      if (!payload.zone_id) throw new Error("Choose a zone you are assigned to");
      if (dialog?.mode !== "edit") throw new Error("Nothing to do");
      return updateFn({ data: { id: dialog.id, ...payload } as never });
    },
    onSuccess: () => {
      toast.success("Property updated");
      setDialog(null);
      setForm(emptyPropertyForm);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changeStatus = useMutation({
    mutationFn: async () => {
      if (dialog?.mode !== "status") throw new Error("Nothing to do");
      return statusFn({
        data: { id: dialog.id, status: dialog.next, ...(reason ? { reason } : {}) } as never,
      });
    },
    onSuccess: () => {
      toast.success("Status updated");
      setDialog(null);
      setReason("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archive = useMutation({
    mutationFn: async () => {
      if (dialog?.mode !== "archive") throw new Error("Nothing to do");
      return archiveFn({ data: { id: dialog.id, ...(reason ? { reason } : {}) } as never });
    },
    onSuccess: () => {
      toast.success("Property archived");
      setDialog(null);
      setReason("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (id: string) => {
    const p = properties.find((row) => row.id === id);
    if (!p) return;
    setForm({
      ...emptyPropertyForm,
      name: p.name,
      code: p.code ?? "",
      property_type: (p.property_type as "building" | "zone") ?? "building",
      building_category: p.building_category ?? "residential",
      subtype: p.subtype ?? "",
      owner_type: (p.owner_type as "landlord" | "agent" | "vendor") ?? "landlord",
      landlord_id: p.owner_id ?? "",
      zone_id: p.zone_id != null ? String(p.zone_id) : "",
      number_of_units: p.number_of_units != null ? String(p.number_of_units) : "",
      status: (p.status as "active" | "archived") ?? "active",
      city: p.city ?? "",
    });
    setDialog({ mode: "edit", id });
  };

  const sortBy = (key: SortKey) => {
    if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const exportCsv = () =>
    downloadCsv(
      "vendor-properties.csv",
      [
        "Name",
        "Reference",
        "Type",
        "Owner",
        "Address",
        "Zone",
        "Units",
        "Occupied",
        "Available",
        "Status",
        "Date added",
      ],
      rows.map((p) => [
        p.name,
        p.code ?? "",
        titleCase(p.property_type),
        p.owner_name ?? "",
        p.address ?? "",
        p.zone_name ?? "",
        p.unit_count,
        p.occupied_units,
        p.available_units,
        titleCase(p.status),
        formatDate(p.created_at),
      ]),
    );

  const th = (key: SortKey, text: string) => (
    <th className="px-3 py-2 text-left">
      <button className="inline-flex items-center gap-1" onClick={() => sortBy(key)}>
        {text}
        <ArrowUpDown className="h-3 w-3" />
      </button>
    </th>
  );

  return (
    <DashboardShell access={access} title="Property Management" description="Properties inside the zones assigned to your vendor account">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div />
          <div className="flex gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
              onClick={() => void refetch()}
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
              onClick={exportCsv}
            >
              <Download className="h-4 w-4" /> Export
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground"
              onClick={() => {
                setForm(emptyPropertyForm);
                setDialog({ mode: "add" });
              }}
            >
              <Plus className="h-4 w-4" /> Add property
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Properties" value={properties.length} />
          <StatCard
            label="Active"
            value={properties.filter((p) => p.status === "active").length}
          />
          <StatCard
            label="Units"
            value={properties.reduce((sum, p) => sum + p.unit_count, 0)}
          />
          <StatCard
            label="Occupied units"
            value={properties.reduce((sum, p) => sum + p.occupied_units, 0)}
          />
        </div>

        <div className="rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm"
                placeholder="Search name, reference, owner or address"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <select
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={zone}
              onChange={(e) => setZone(e.target.value)}
            >
              <option value="all">All zones</option>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value)}
            >
              <option value="all">All types</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {titleCase(t)}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="archived">Deactivated</option>
            </select>
          </div>

          {isLoading ? (
            <LoadingBlock />
          ) : error ? (
            <ErrorBlock message={(error as Error).message} />
          ) : visible.length === 0 ? (
            <EmptyState
              title="No properties yet"
              message="Properties inside your assigned zones will appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Photo</th>
                    {th("name", "Property")}
                    {th("property_type", "Type")}
                    {th("owner_name", "Owner")}
                    <th className="px-3 py-2 text-left">Address</th>
                    {th("zone_name", "Zone")}
                    {th("unit_count", "Units")}
                    {th("occupied_units", "Occupied")}
                    <th className="px-3 py-2 text-left">Available</th>
                    {th("status", "Status")}
                    {th("created_at", "Date added")}
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((p) => (
                    <tr key={p.id} className="border-b border-border/60">
                      <td className="px-3 py-2">
                        {p.photo_url ? (
                          <img
                            src={p.photo_url}
                            alt={`${p.name} photo`}
                            className="h-9 w-9 rounded-lg object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          to="/vendor/properties/$propertyId"
                          params={{ propertyId: p.id }}
                          className="font-bold text-foreground hover:underline"
                        >
                          {p.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{p.code ?? p.id.slice(0, 8)}</p>
                      </td>
                      <td className="px-3 py-2">{titleCase(p.property_type)}</td>
                      <td className="px-3 py-2">
                        {p.owner_name ?? "—"}
                        <p className="text-xs text-muted-foreground">{titleCase(p.owner_type)}</p>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{p.address ?? "—"}</td>
                      <td className="px-3 py-2">{p.zone_name ?? "—"}</td>
                      <td className="px-3 py-2">{p.unit_count}</td>
                      <td className="px-3 py-2">{p.occupied_units}</td>
                      <td className="px-3 py-2">{p.available_units}</td>
                      <td className="px-3 py-2">
                        <StatusBadge value={p.status} />
                      </td>
                      <td className="px-3 py-2">{formatDate(p.created_at)}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-2 text-xs">
                          <Link
                            to="/vendor/properties/$propertyId"
                            params={{ propertyId: p.id }}
                            className="rounded-md border border-border px-2 py-1"
                          >
                            View
                          </Link>
                          <button
                            className="rounded-md border border-border px-2 py-1"
                            onClick={() => openEdit(p.id)}
                          >
                            Edit
                          </button>
                          <button
                            className="rounded-md border border-border px-2 py-1"
                            onClick={() =>
                              setDialog({
                                mode: "status",
                                id: p.id,
                                name: p.name,
                                next: p.status === "active" ? "archived" : "active",
                              })
                            }
                          >
                            {p.status === "active" ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            className="rounded-md border border-destructive/40 px-2 py-1 text-destructive"
                            onClick={() => setDialog({ mode: "archive", id: p.id, name: p.name })}
                          >
                            Archive
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 px-3">
            <select
              className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {LIMIT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} per page
                </option>
              ))}
            </select>
            <Pagination
              page={page}
              pageCount={Math.max(1, Math.ceil(total / pageSize))}
              total={total}
              onPage={setPage}
            />
          </div>
        </div>
      </div>

      {dialog?.mode === "add" && (
        <VendorModal wide title="Add property" onClose={() => setDialog(null)}>
          <Wizard
            submitLabel="Create property"
            pending={save.isPending}
            onCancel={() => setDialog(null)}
            onSubmit={() => save.mutate()}
            steps={[
              {
                title: "Property details",
                description: "Name, type and description of the property.",
                validate: () => (form.name.trim() ? null : "Property name is required"),
                content: (
                  <PropertyFormFields
                    section="details"
                    form={form}
                    onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
                    owners={options.data?.owners ?? []}
                    zones={options.data?.zones ?? []}
                  />
                ),
              },
              {
                title: "Address",
                description: "Where the property is located.",
                content: (
                  <PropertyFormFields
                    section="address"
                    form={form}
                    onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
                    owners={options.data?.owners ?? []}
                    zones={options.data?.zones ?? []}
                  />
                ),
              },
              {
                title: "Review",
                description: "Check everything before creating the property.",
                validate: () =>
                  !form.name.trim()
                    ? "Property name is required"
                    : !form.zone_id
                      ? "Choose a zone you are assigned to"
                      : null,
                content: (
                  <ReviewList
                    items={[
                      ["Name", form.name],
                      ["Reference", form.code],
                      ["Type", titleCase(form.property_type)],
                      ["Owner type", titleCase(form.owner_type)],
                      [
                        "Owner",
                        options.data?.owners.find((o) => o.id === form.landlord_id)?.name ?? "",
                      ],
                      [
                        "Zone",
                        options.data?.zones.find((z) => String(z.zone_id) === form.zone_id)
                          ?.zone_name ?? "",
                      ],
                      ["Units", form.number_of_units],
                      ["Status", titleCase(form.status)],
                      [
                        "Address",
                        [form.building_number, form.street, form.estate, form.city, form.state, form.country]
                          .filter(Boolean)
                          .join(", "),
                      ],
                    ]}
                  />
                ),
              },
            ]}
          />
        </VendorModal>
      )}

      {dialog?.mode === "edit" && (
        <VendorModal wide title="Edit property" onClose={() => setDialog(null)}>
          <PropertyFormFields
            form={form}
            onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
            owners={options.data?.owners ?? []}
            zones={options.data?.zones ?? []}
          />
          <div className="mt-4 flex justify-end gap-2">
            <button className="rounded-lg border border-border px-3 py-2 text-sm" onClick={() => setDialog(null)}>
              Cancel
            </button>
            <button
              className="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Saving…" : "Save property"}
            </button>
          </div>
        </VendorModal>
      )}

      {dialog?.mode === "status" && (
        <VendorModal
          title={dialog.next === "active" ? "Activate property" : "Deactivate property"}
          onClose={() => setDialog(null)}
        >
          <p className="text-sm text-muted-foreground">
            {dialog.next === "active"
              ? `Reactivate ${dialog.name}? Units, residents and meters stay exactly as they are.`
              : `Deactivate ${dialog.name}? All units, residents, payments and meter records are preserved.`}
          </p>
          <textarea
            className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            rows={2}
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="mt-4 flex justify-end gap-2">
            <button className="rounded-lg border border-border px-3 py-2 text-sm" onClick={() => setDialog(null)}>
              Cancel
            </button>
            <button
              className="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground"
              disabled={changeStatus.isPending}
              onClick={() => changeStatus.mutate()}
            >
              Confirm
            </button>
          </div>
        </VendorModal>
      )}

      {dialog?.mode === "archive" && (
        <VendorModal title="Archive property" onClose={() => setDialog(null)}>
          <p className="text-sm text-muted-foreground">
            {dialog.name} will be archived, not deleted. Units, residents, payments, meters and
            history stay intact.
          </p>
          <textarea
            className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            rows={2}
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="mt-4 flex justify-end gap-2">
            <button className="rounded-lg border border-border px-3 py-2 text-sm" onClick={() => setDialog(null)}>
              Cancel
            </button>
            <button
              className="rounded-lg bg-destructive px-3 py-2 text-sm font-bold text-destructive-foreground"
              disabled={archive.isPending}
              onClick={() => archive.mutate()}
            >
              Archive
            </button>
          </div>
        </VendorModal>
      )}
    </DashboardShell>
  );
}
