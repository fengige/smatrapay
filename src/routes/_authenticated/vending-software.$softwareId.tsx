import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  History,
  Loader2,
  Pencil,
  PowerOff,
  Search,
  Shuffle,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { PortalLayout } from "@/components/PortalLayout";
import { VendingSoftwareApiSettingsTab } from "@/components/VendingSoftwareApiSettingsTab";
import { VendingSoftwareDialog } from "@/components/VendingSoftwareDialog";
import {
  archiveVendingSoftware,
  getVendingSoftware,
  setVendingSoftwareStatus,
  listVendingSoftware,
  reassignMetersVendingSoftware,
  type VendingSoftwareDetail,
  type VendingSoftwareMeterRow,
  type VendingSoftwareAuditRow,
} from "@/lib/vending-software.functions";

export const Route = createFileRoute("/_authenticated/vending-software/$softwareId")({
  head: () => ({
    meta: [
      { title: "Vending Software Details · SmatraPay" },
      {
        name: "description",
        content:
          "Vending software profile, the meters that use it, usage breakdown by type, supplier and zone, plus its activity history.",
      },
      { property: "og:title", content: "Vending Software Details · SmatraPay" },
      {
        property: "og:description",
        content: "Software info, meters, usage summary and activity history for one vending platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VendingSoftwareDetailsPage,
  errorComponent: ({ error }) => <div className="p-10 text-sm text-destructive">{(error as Error).message}</div>,
});

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-500/12 text-emerald-600",
  inactive: "bg-muted text-muted-foreground",
  archived: "bg-destructive/10 text-destructive",
};

const dash = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === "" ? "—" : String(v);

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";

const fmtDateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

const ACTION_LABEL: Record<string, string> = {
  created: "Vending software created",
  updated: "Vending software updated",
  activated: "Vending software activated",
  deactivated: "Vending software deactivated",
  archived: "Vending software archived",
  meter_assigned: "Vending software assigned to meter",
  meter_removed: "Vending software removed from meter",
  api_settings_created: "API settings configured",
  api_settings_updated: "API settings updated",
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function Bars({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h4 className="text-sm font-bold text-foreground">{title}</h4>
      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">No data yet.</p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {rows.map((r) => (
            <li key={r.label} className="grid gap-1">
              <div className="flex items-center justify-between text-xs">
                <span className="capitalize text-muted-foreground">{r.label}</span>
                <span className="font-semibold text-foreground">{r.count}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-primary"
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const TABS = [
  { key: "info", label: "Software Info" },
  { key: "api", label: "API Settings" },
  { key: "meters", label: "Meters" },
  { key: "usage", label: "Usage Summary" },
  { key: "history", label: "Activity" },
] as const;

function VendingSoftwareDetailsPage() {
  const { softwareId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const fetchSoftware = useServerFn(getVendingSoftware);
  const changeStatus = useServerFn(setVendingSoftwareStatus);
  const archive = useServerFn(archiveVendingSoftware);

  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("info");
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [zoneFilter, setZoneFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["vending-software", softwareId],
    queryFn: () =>
      fetchSoftware({ data: { id: softwareId } } as never) as Promise<{
        software: VendingSoftwareDetail;
      }>,
  });

  const software = data?.software;

  const fetchAllSoftware = useServerFn(listVendingSoftware);
  const reassign = useServerFn(reassignMetersVendingSoftware);

  const { data: allSoftware } = useQuery({
    queryKey: ["vending-software"],
    queryFn: () =>
      fetchAllSoftware() as Promise<{ software: { id: string; name: string; status: string }[] }>,
  });

  const targets = (allSoftware?.software ?? []).filter(
    (s) => s.status === "active" && s.id !== softwareId,
  );

  const reassignMutation = useMutation({
    mutationFn: () =>
      reassign({
        data: { meterIds: selected, targetSoftwareId: target === "none" ? null : target },
      } as never) as Promise<{ moved: number; target: string | null }>,
    onSuccess: async (r) => {
      setSelected([]);
      setTarget("");
      await queryClient.invalidateQueries({ queryKey: ["vending-software"] });
      await refetch();
      toast.success(
        `${r.moved} meter${r.moved === 1 ? "" : "s"} moved to ${r.target ?? "no vending software"}`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: (status: "active" | "inactive") =>
      changeStatus({ data: { id: softwareId, status } } as never),
    onSuccess: async (_r, status) => {
      await queryClient.invalidateQueries({ queryKey: ["vending-software"] });
      await refetch();
      toast.success(status === "active" ? "Vending software activated" : "Vending software deactivated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archiveMutation = useMutation({
    mutationFn: () => archive({ data: { id: softwareId } } as never),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["vending-software"] });
      toast.success("Vending software archived");
      navigate({ to: "/vending-software" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const meters = software?.meters ?? [];

  const suppliers = useMemo(
    () => [...new Set(meters.map((m: VendingSoftwareMeterRow) => m.supplier_name).filter(Boolean))] as string[],
    [meters],
  );
  const zones = useMemo(
    () => [...new Set(meters.map((m: VendingSoftwareMeterRow) => m.zone_name).filter(Boolean))] as string[],
    [meters],
  );

  const filteredMeters = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return meters.filter((m: VendingSoftwareMeterRow) => {
      if (typeFilter !== "all" && m.type !== typeFilter) return false;
      if (supplierFilter !== "all" && m.supplier_name !== supplierFilter) return false;
      if (zoneFilter !== "all" && m.zone_name !== zoneFilter) return false;
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (!needle) return true;
      return [m.meter_number, m.serial_number, m.property_name ?? "", m.unit_number ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [meters, q, typeFilter, supplierFilter, zoneFilter, statusFilter]);

  /** Projected effect of the pending move on this software's usage summary. */
  const impact = useMemo(() => {
    const picked = meters.filter((m: VendingSoftwareMeterRow) => selected.includes(m.id));
    const byType = new Map<string, number>();
    let active = 0;
    for (const m of picked) {
      byType.set(m.type, (byType.get(m.type) ?? 0) + 1);
      if (m.status === "active") active += 1;
    }
    return {
      count: picked.length,
      active,
      byType: [...byType.entries()].map(([label, count]) => ({ label, count })),
    };
  }, [meters, selected]);

  const allFilteredSelected =
    filteredMeters.length > 0 &&
    filteredMeters.every((m: VendingSoftwareMeterRow) => selected.includes(m.id));

  const toggleAll = () =>
    setSelected((prev) =>
      allFilteredSelected
        ? prev.filter((id) => !filteredMeters.some((m: VendingSoftwareMeterRow) => m.id === id))
        : [...new Set([...prev, ...filteredMeters.map((m: VendingSoftwareMeterRow) => m.id)])],
    );

  if (isLoading || !software) {
    return (
      <PortalLayout roles={["admin"]} title="Vending Software" description="Loading…">
        <div className="flex justify-center py-20 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout
      roles={["admin"]}
      title={software.name}
      description="Vending software details"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/vending-software"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10"
          >
            <ArrowLeft className="size-4" /> Back
          </Link>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10"
          >
            <Pencil className="size-4" /> Edit
          </button>
          <button
            type="button"
            disabled={statusMutation.isPending || software.status === "archived"}
            onClick={() => {
              const next = software.status === "active" ? "inactive" : "active";
              const msg =
                next === "inactive"
                  ? `Deactivate ${software.name}? ${software.meter_count} meter(s) keep their assignment.`
                  : `Activate ${software.name}?`;
              if (window.confirm(msg)) statusMutation.mutate(next);
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10 disabled:opacity-60"
          >
            {software.status === "active" ? (
              <>
                <PowerOff className="size-4" /> Deactivate
              </>
            ) : (
              <>
                <CheckCircle2 className="size-4" /> Activate
              </>
            )}
          </button>
          <button
            type="button"
            disabled={archiveMutation.isPending || software.status === "archived"}
            onClick={() => {
              if (software.meter_count > 0) {
                toast.error(
                  "This vending software is currently assigned to meters and cannot be permanently deleted. Deactivate it instead.",
                );
                return;
              }
              if (window.confirm(`Archive ${software.name}?`)) archiveMutation.mutate();
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
          >
            <Trash2 className="size-4" /> Archive
          </button>
        </div>
      }
    >
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center gap-5">
          {software.logo_url ? (
            <img src={software.logo_url} alt="" className="size-16 rounded-2xl object-cover" />
          ) : (
            <span className="inline-flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-lg font-bold text-primary">
              {software.name.slice(0, 2).toUpperCase()}
            </span>
          )}
          <div className="grid flex-1 gap-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-bold text-foreground">{software.name}</h2>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${STATUS_TONE[software.status] ?? ""}`}
              >
                {software.status}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {dash(software.code)} · v{dash(software.version)} · {software.meter_count.toLocaleString()} meter
              {software.meter_count === 1 ? "" : "s"}
            </p>
            <p className="text-xs text-muted-foreground">
              Added {fmtDate(software.created_at)} · Updated {fmtDate(software.updated_at)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap gap-1 border-b border-border px-3 pt-3">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key}
              className={`rounded-t-lg px-4 py-2 text-sm font-medium ${
                tab === t.key
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === "info" && (
            <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Software name" value={software.name} />
              <Field label="Software code" value={dash(software.code)} />
              <Field label="Version" value={dash(software.version)} />
              <Field label="Status" value={<span className="capitalize">{software.status}</span>} />
              <Field label="Date created" value={fmtDateTime(software.created_at)} />
              <Field label="Created by" value={dash(software.created_by_name)} />
              <Field label="Last updated" value={fmtDateTime(software.updated_at)} />
              <Field label="Updated by" value={dash(software.updated_by_name)} />
              <div className="sm:col-span-2 lg:col-span-3">
                <Field label="Description" value={dash(software.description)} />
              </div>
            </dl>
          )}

          {tab === "api" && <VendingSoftwareApiSettingsTab softwareId={softwareId} />}

          {tab === "meters" && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[200px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search meter, serial, property or unit"
                    aria-label="Search meters"
                    className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm"
                  />
                </div>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  aria-label="Filter by meter type"
                  className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
                >
                  <option value="all">All types</option>
                  <option value="electricity">Electricity</option>
                  <option value="water">Water</option>
                  <option value="gas">Gas</option>
                </select>
                <select
                  value={supplierFilter}
                  onChange={(e) => setSupplierFilter(e.target.value)}
                  aria-label="Filter by supplier"
                  className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
                >
                  <option value="all">All suppliers</option>
                  {suppliers.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <select
                  value={zoneFilter}
                  onChange={(e) => setZoneFilter(e.target.value)}
                  aria-label="Filter by zone"
                  className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
                >
                  <option value="all">All zones</option>
                  {zones.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  aria-label="Filter by meter status"
                  className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/20 p-3">
                <Shuffle className="size-4 text-primary" />
                <span className="text-sm font-medium text-foreground">
                  {selected.length
                    ? `${selected.length} meter${selected.length === 1 ? "" : "s"} selected`
                    : "Select meters to move them to another vending software"}
                </span>
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  aria-label="Move selected meters to"
                  disabled={!selected.length}
                  className="h-10 rounded-xl border border-border bg-background px-3 text-sm disabled:opacity-60"
                >
                  <option value="">Move to…</option>
                  {targets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                  <option value="none">No vending software</option>
                </select>
                <button
                  type="button"
                  disabled={!selected.length || !target || reassignMutation.isPending}
                  onClick={() => {
                    const label =
                      target === "none"
                        ? "no vending software"
                        : (targets.find((t) => t.id === target)?.name ?? "");
                    if (
                      window.confirm(
                        `Move ${selected.length} meter(s) from ${software.name} to ${label}? This software's meter count drops to ${software.meter_count - selected.length}.`,
                      )
                    )
                      reassignMutation.mutate();
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {reassignMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                  Move meters
                </button>
                {selected.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelected([])}
                    className="text-sm font-medium text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Clear
                  </button>
                )}
                {selected.length > 0 && (
                  <p className="basis-full text-xs text-muted-foreground">
                    Usage impact: total {software.usage.total} → {software.usage.total - impact.count},
                    active {software.usage.activeMeters} → {software.usage.activeMeters - impact.active}
                    {impact.byType.length
                      ? ` · ${impact.byType.map((t) => `${t.count} ${t.label}`).join(", ")} leaving`
                      : ""}
                  </p>
                )}
              </div>

              <div className="mt-4 overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3 text-left">
                        <input
                          type="checkbox"
                          aria-label="Select all meters"
                          checked={allFilteredSelected}
                          onChange={toggleAll}
                        />
                      </th>
                      <th className="px-3 py-3 text-left">Meter no.</th>
                      <th className="px-3 py-3 text-left">Serial</th>
                      <th className="px-3 py-3 text-left">Type</th>
                      <th className="px-3 py-3 text-left">Supplier</th>
                      <th className="px-3 py-3 text-left">Property</th>
                      <th className="px-3 py-3 text-left">Unit</th>
                      <th className="px-3 py-3 text-left">Zone</th>
                      <th className="px-3 py-3 text-left">Landlord</th>
                      <th className="px-3 py-3 text-left">Resident</th>
                      <th className="px-3 py-3 text-left">Status</th>
                      <th className="px-3 py-3 text-left">Installed</th>
                      <th className="px-3 py-3 text-left">Last reading</th>
                      <th className="px-3 py-3 text-left">Last comms</th>
                      <th className="px-3 py-3 text-left">Assigned</th>
                      <th className="px-3 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!filteredMeters.length && (
                      <tr>
                        <td colSpan={16} className="px-3 py-10 text-center text-muted-foreground">
                          {meters.length
                            ? "No meters match your filters."
                            : "No meters are currently using this vending software."}
                        </td>
                      </tr>
                    )}
                    {filteredMeters.map((m: VendingSoftwareMeterRow) => (
                      <tr key={m.id} className="border-t border-border/70">
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            aria-label={`Select meter ${m.meter_number}`}
                            checked={selected.includes(m.id)}
                            onChange={() =>
                              setSelected((prev) =>
                                prev.includes(m.id)
                                  ? prev.filter((id) => id !== m.id)
                                  : [...prev, m.id],
                              )
                            }
                          />
                        </td>
                        <td className="px-3 py-3 font-medium text-foreground">{m.meter_number}</td>
                        <td className="px-3 py-3">{dash(m.serial_number)}</td>
                        <td className="px-3 py-3 capitalize">{dash(m.type)}</td>
                        <td className="px-3 py-3">{dash(m.supplier_name)}</td>
                        <td className="px-3 py-3">{dash(m.property_name)}</td>
                        <td className="px-3 py-3">{dash(m.unit_number)}</td>
                        <td className="px-3 py-3">{dash(m.zone_name)}</td>
                        <td className="px-3 py-3">{dash(m.landlord_name)}</td>
                        <td className="px-3 py-3">{dash(m.resident_name)}</td>
                        <td className="px-3 py-3 capitalize">{dash(m.status)}</td>
                        <td className="px-3 py-3">{fmtDate(m.installation_date)}</td>
                        <td className="px-3 py-3">{m.last_reading ?? "—"}</td>
                        <td className="px-3 py-3">{fmtDate(m.last_communication)}</td>
                        <td className="px-3 py-3">{fmtDate(m.assigned_at)}</td>
                        <td className="px-3 py-3 text-right">
                          <Link
                            to="/meters/$meterId"
                            params={{ meterId: m.id }}
                            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent/10"
                          >
                            <Eye className="size-3.5" /> View Meter
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === "usage" &&
            (software.usage.total === 0 ? (
              <p className="text-sm text-muted-foreground">
                No meters are currently using this vending software.
              </p>
            ) : (
              <div className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  {[
                    { label: "Total meters", value: software.usage.total },
                    { label: "Active meters", value: software.usage.activeMeters },
                    { label: "Inactive meters", value: software.usage.inactiveMeters },
                  ].map((c) => (
                    <div key={c.label} className="rounded-2xl border border-border bg-background p-5">
                      <span className="text-sm text-muted-foreground">{c.label}</span>
                      <div className="mt-2 text-2xl font-bold">{c.value}</div>
                    </div>
                  ))}
                </div>
                {selected.length > 0 && (
                  <p className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm text-foreground">
                    Pending move of {impact.count} meter{impact.count === 1 ? "" : "s"}: total would become{" "}
                    {software.usage.total - impact.count} and active{" "}
                    {software.usage.activeMeters - impact.active}.
                  </p>
                )}
                <div className="grid gap-4 lg:grid-cols-3">
                  <Bars title="Meters by type" rows={software.usage.byType} />
                  <Bars title="Meters by supplier" rows={software.usage.bySupplier} />
                  <Bars title="Meters by zone" rows={software.usage.byZone} />
                </div>
              </div>
            ))}

          {tab === "history" && (
            <>
              <div className="mb-3 flex items-center gap-2">
                <History className="size-4 text-primary" />
                <h4 className="text-sm font-bold text-foreground">Activity &amp; status history</h4>
              </div>
              {software.history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-3 text-left">Date / time</th>
                        <th className="px-3 py-3 text-left">Action</th>
                        <th className="px-3 py-3 text-left">Previous status</th>
                        <th className="px-3 py-3 text-left">New status</th>
                        <th className="px-3 py-3 text-left">User</th>
                        <th className="px-3 py-3 text-left">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {software.history.map((h: VendingSoftwareAuditRow) => (
                        <tr key={h.id} className="border-t border-border/70">
                          <td className="px-3 py-3">{fmtDateTime(h.created_at)}</td>
                          <td className="px-3 py-3 font-medium text-foreground">
                            {ACTION_LABEL[h.action] ?? h.action}
                          </td>
                          <td className="px-3 py-3 capitalize">{dash(h.previous_status)}</td>
                          <td className="px-3 py-3 capitalize">{dash(h.new_status)}</td>
                          <td className="px-3 py-3">{dash(h.actor_name)}</td>
                          <td className="px-3 py-3 text-muted-foreground">
                            {h.reason ?? (h.meter_number ? `Meter ${h.meter_number}` : "—")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {editing && (
        <VendingSoftwareDialog
          software={software}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            await queryClient.invalidateQueries({ queryKey: ["vending-software"] });
            await refetch();
            toast.success("Vending software updated");
          }}
        />
      )}
    </PortalLayout>
  );
}
