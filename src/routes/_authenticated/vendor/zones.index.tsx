import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Eye,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Route as RouteIcon,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import {
  addZone,
  deleteZone,
  getZone,
  listZones,
  setZoneStatus,
  updateZone,
  type ZoneRow,
} from "@/lib/zones.functions";
import { RouteManager } from "@/components/zones/RouteManager";
import { ZoneImportDialog } from "@/components/zones/ZoneImportDialog";

export const Route = createFileRoute("/_authenticated/vendor/zones/")({
  head: () => ({
    meta: [
      { title: "Zone Management · Vendor · SmatraPay" },
      {
        name: "description",
        content: "Manage zones, routes and streets used for meter and field operations.",
      },
      { property: "og:title", content: "Zone Management · Vendor · SmatraPay" },
      {
        property: "og:description",
        content: "Add zones, import them from CSV and manage their routes and streets.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorZonesPage,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{(error as Error).message}</p>,
});

function VendorZonesPage() {
  const access = Route.useLoaderData();
  const queryClient = useQueryClient();
  const fetchZones = useServerFn(listZones);
  const removeZone = useServerFn(deleteZone);
  const statusFn = useServerFn(setZoneStatus);

  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<ZoneRow | null>(null);
  const [deleting, setDeleting] = useState<ZoneRow | null>(null);
  const [viewing, setViewing] = useState<ZoneRow | null>(null);
  const [toggling, setToggling] = useState<ZoneRow | null>(null);
  const [importing, setImporting] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["zones"],
    queryFn: () => fetchZones(),
  });

  const zones = (data?.zones ?? []) as ZoneRow[];

  const deleteMutation = useMutation({
    mutationFn: (zone_id: number) => removeZone({ data: { zone_id } } as never),
    onSuccess: async () => {
      setDeleting(null);
      await queryClient.invalidateQueries({ queryKey: ["zones"] });
      await queryClient.invalidateQueries({ queryKey: ["vendor-scope"] });
      toast.success("Zone deleted");
    },
    onError: (e: Error) => toast.error(e.message || "Could not delete zone"),
  });

  const statusMutation = useMutation({
    mutationFn: ({ zone_id, status }: { zone_id: number; status: "Active" | "Inactive" }) =>
      statusFn({ data: { zone_id, status } } as never),
    onSuccess: async (_r, vars) => {
      setToggling(null);
      await queryClient.invalidateQueries({ queryKey: ["zones"] });
      await queryClient.invalidateQueries({ queryKey: ["vendor-scope"] });
      toast.success(vars.status === "Active" ? "Zone activated" : "Zone deactivated");
    },
    onError: (e: Error) => toast.error(e.message || "Could not update zone status"),
  });

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return zones;
    return zones.filter((z) =>
      [z.zone_name, z.description ?? ""].join(" ").toLowerCase().includes(needle),
    );
  }, [zones, q]);

  const totalRoutes = zones.reduce((sum, z) => sum + z.route_count, 0);
  const withRoutes = zones.filter((z) => z.route_count > 0).length;

  return (
    <DashboardShell
      access={access}
      title="Zone Management"
      description="Geographic zones used to organise routes and streets"
    >
      <div className="space-y-6 pb-6">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="size-4" /> Add Zone
          </button>
          <button
            type="button"
            onClick={() => setImporting(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10"
          >
            <Upload className="size-4" /> Import CSV
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            aria-label="Refresh zones"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10"
          >
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <SummaryCard label="Total zones" value={zones.length} icon={MapPin} tone="text-primary" />
          <SummaryCard
            label="Zones with routes"
            value={withRoutes}
            icon={CheckCircle2}
            tone="text-emerald-600"
          />
          <SummaryCard
            label="Total routes"
            value={totalRoutes}
            icon={RouteIcon}
            tone="text-muted-foreground"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search zone name or description"
              aria-label="Search zones"
              className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-8 px-2 py-3" />
                <th className="px-4 py-3 text-left">Zone</th>
                <th className="px-4 py-3 text-left">Description</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Routes</th>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    <Loader2 className="mx-auto size-5 animate-spin" />
                  </td>
                </tr>
              )}
              {!isLoading && !rows.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    No zones match your search. Use “Add Zone” to create one.
                  </td>
                </tr>
              )}
              {rows.map((z) => (
                <>
                  <tr key={z.zone_id} className="border-t border-border/70">
                    <td className="px-2 py-3 align-top">
                      <button
                        type="button"
                        aria-expanded={expanded === z.zone_id}
                        aria-label={`${expanded === z.zone_id ? "Hide" : "Show"} routes for ${z.zone_name}`}
                        onClick={() => setExpanded((p) => (p === z.zone_id ? null : z.zone_id))}
                        className="rounded p-1 hover:bg-accent/10"
                      >
                        {expanded === z.zone_id ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{z.zone_name}</div>
                      <div className="text-xs text-muted-foreground">Zone #{z.zone_id}</div>
                    </td>
                    <td className="max-w-md px-4 py-3">
                      <span className="line-clamp-2">{z.description ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                          z.status === "Active"
                            ? "bg-emerald-500/10 text-emerald-600"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {z.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">{z.route_count}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(z.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Link
                          to="/vendor/zones/$zoneId"
                          params={{ zoneId: String(z.zone_id) }}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent/10"
                        >
                          <Eye className="size-3.5" /> View
                        </Link>
                        <button
                          type="button"
                          onClick={() => setViewing(z)}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent/10"
                        >
                          Summary
                        </button>
                        <button
                          type="button"
                          onClick={() => setToggling(z)}
                          aria-label={`${z.status === "Active" ? "Deactivate" : "Activate"} ${z.zone_name}`}
                          className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                            z.status === "Active"
                              ? "border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
                              : "border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10"
                          }`}
                        >
                          <Power className="size-3.5" />
                          {z.status === "Active" ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(z)}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent/10"
                        >
                          <Pencil className="size-3.5" /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(z)}
                          className="inline-flex items-center gap-1 rounded-lg border border-destructive/40 px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="size-3.5" /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expanded === z.zone_id && (
                    <tr key={`routes-${z.zone_id}`} className="border-t border-border/70 bg-muted/20">
                      <td colSpan={7} className="p-3">
                        <RouteManager zoneId={z.zone_id} zoneName={z.zone_name} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground">
          Deleting a zone also deletes its routes and streets. Expand a zone to manage its routes and
          streets inline.
        </p>
      </div>

      {importing && (
        <ZoneImportDialog
          onClose={() => setImporting(false)}
          onImported={async () => {
            await queryClient.invalidateQueries({ queryKey: ["zones"] });
            await queryClient.invalidateQueries({ queryKey: ["vendor-scope"] });
          }}
        />
      )}

      {(showAdd || editing) && (
        <ZoneDialog
          zone={editing}
          onClose={() => {
            setShowAdd(false);
            setEditing(null);
          }}
          onSaved={async () => {
            const wasEdit = Boolean(editing);
            setShowAdd(false);
            setEditing(null);
            await queryClient.invalidateQueries({ queryKey: ["zones"] });
            await queryClient.invalidateQueries({ queryKey: ["vendor-scope"] });
            toast.success(wasEdit ? "Zone updated" : "Zone added");
          }}
        />
      )}

      {viewing && <ZoneViewDialog zoneId={viewing.zone_id} onClose={() => setViewing(null)} />}

      {toggling && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vendor-zone-status-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setToggling(null);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-lg">
            <h2 id="vendor-zone-status-title" className="text-lg font-bold">
              {toggling.status === "Active" ? "Deactivate" : "Activate"} “{toggling.zone_name}”?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {toggling.status === "Active"
                ? "Inactive zones stay visible in history but should not be used for new routes, streets, or field operations."
                : "Activating this zone makes it available for routes, streets, and field operations again."}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setToggling(null)}
                className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium hover:bg-accent/10"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={statusMutation.isPending}
                onClick={() =>
                  statusMutation.mutate({
                    zone_id: toggling.zone_id,
                    status: toggling.status === "Active" ? "Inactive" : "Active",
                  })
                }
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {statusMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                {toggling.status === "Active" ? "Deactivate zone" : "Activate zone"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vendor-zone-delete-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleting(null);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-lg">
            <h2 id="vendor-zone-delete-title" className="text-lg font-bold">
              Delete “{deleting.zone_name}”?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This will permanently remove the zone
              {deleting.route_count > 0 &&
                ` and its ${deleting.route_count} route${deleting.route_count === 1 ? "" : "s"} (and their streets)`}
              . This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleting(null)}
                className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium hover:bg-accent/10"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleting.zone_id)}
                className="inline-flex items-center gap-2 rounded-lg bg-destructive px-3.5 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90 disabled:opacity-60"
              >
                {deleteMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                Delete zone
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className={`size-4 ${tone}`} />
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}

function ZoneDialog({
  zone,
  onClose,
  onSaved,
}: {
  zone: ZoneRow | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const isEdit = Boolean(zone);
  const create = useServerFn(addZone);
  const edit = useServerFn(updateZone);

  const [form, setForm] = useState({
    zone_name: zone?.zone_name ?? "",
    description: zone?.description ?? "",
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const nameError = form.zone_name.trim().length < 2 ? "Zone name is required" : null;

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        zone_name: form.zone_name.trim(),
        description: form.description.trim() || null,
      };
      if (isEdit && zone) await edit({ data: { ...payload, zone_id: zone.zone_id } } as never);
      else await create({ data: payload } as never);
    },
    onSuccess: () => onSaved(),
    onError: (e: Error) => toast.error(e.message || "Could not save zone"),
  });

  const field = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm";

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="vendor-zone-dialog-title"
    >
      <div className="my-8 w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-lg">
        <h2 id="vendor-zone-dialog-title" className="text-lg font-bold">
          {isEdit ? "Edit Zone" : "Add Zone"}
        </h2>
        <p className="text-sm text-muted-foreground">
          Zones group routes and streets for meter and field-operations management.
        </p>

        <div className="mt-4 grid gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="vendor-zone-name">
              Zone name
            </label>
            <input
              id="vendor-zone-name"
              value={form.zone_name}
              onChange={(e) => setForm((p) => ({ ...p, zone_name: e.target.value }))}
              aria-invalid={Boolean(nameError)}
              className={field}
            />
            {nameError && <p className="mt-1 text-xs text-destructive">{nameError}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="vendor-zone-desc">
              Description <span className="text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="vendor-zone-desc"
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              rows={3}
              maxLength={500}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium hover:bg-accent/10"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={Boolean(nameError) || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            {isEdit ? "Save changes" : "Add zone"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ZoneViewDialog({ zoneId, onClose }: { zoneId: number; onClose: () => void }) {
  const fetchZone = useServerFn(getZone);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["zone", zoneId],
    queryFn: () => fetchZone({ data: { zone_id: zoneId } } as never),
  });
  const zone = data?.zone;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="vendor-zone-view-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="my-8 w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-lg">
        {isLoading && (
          <div className="grid place-items-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {isError && (
          <p className="py-10 text-center text-sm text-destructive">
            {(error as Error)?.message || "Could not load zone"}
          </p>
        )}
        {zone && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="vendor-zone-view-title" className="text-lg font-bold">
                  {zone.zone_name}
                </h2>
                <p className="text-xs text-muted-foreground">Zone #{zone.zone_id}</p>
              </div>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                  zone.status === "Active"
                    ? "bg-emerald-500/10 text-emerald-600"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {zone.status}
              </span>
            </div>

            <p className="mt-3 text-sm text-muted-foreground">
              {zone.description || "No description provided."}
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border p-4">
                <div className="text-xs text-muted-foreground">Routes</div>
                <div className="mt-1 text-xl font-bold">{zone.route_count}</div>
              </div>
              <div className="rounded-xl border border-border p-4">
                <div className="text-xs text-muted-foreground">Streets</div>
                <div className="mt-1 text-xl font-bold">{zone.street_count}</div>
              </div>
              <div className="rounded-xl border border-border p-4">
                <div className="text-xs text-muted-foreground">Created</div>
                <div className="mt-1 text-sm font-semibold">
                  {new Date(zone.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>

            <h3 className="mt-5 text-sm font-semibold">Routes in this zone</h3>
            <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-border">
              {!zone.routes.length && (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No routes yet. Expand the zone in the table to add one.
                </p>
              )}
              {zone.routes.map((r) => (
                <div
                  key={r.route_id}
                  className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-4 py-2.5 text-sm first:border-t-0"
                >
                  <div>
                    <span className="font-medium">{r.route_code}</span>
                    <span className="ml-2 text-muted-foreground">{r.route_name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{r.street_count} streets</span>
                    <span
                      className={`rounded-full px-2 py-0.5 font-medium ${
                        r.status === "Active"
                          ? "bg-emerald-500/10 text-emerald-600"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium hover:bg-accent/10"
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
