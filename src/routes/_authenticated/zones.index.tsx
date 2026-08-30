import { createFileRoute } from "@tanstack/react-router";
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

import {
  addZone,
  deleteZone,
  getZone,
  listZones,
  setZoneStatus,
  updateZone,
  type ZoneRow,
} from "@/lib/zones.functions";
import { PortalLayout } from "@/components/PortalLayout";
import { RouteManager } from "@/components/zones/RouteManager";
import { ZoneImportDialog } from "@/components/zones/ZoneImportDialog";
import { ZoneAuditViewer } from "@/components/zones/ZoneAuditViewer";

export const Route = createFileRoute("/_authenticated/zones/")({
  head: () => ({
    meta: [
      { title: "Zone Management · SmatraPay" },
      {
        name: "description",
        content:
          "Manage service zones: zone names, descriptions and the routes that belong to each zone.",
      },
      { property: "og:title", content: "Zone Management · SmatraPay" },
      {
        property: "og:description",
        content: "Add, edit and remove the geographic zones used to organise routes and streets.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ZonesPage,
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-destructive">{error.message}</div>
  ),
});

function ZonesPage() {
  const queryClient = useQueryClient();
  const fetchZones = useServerFn(listZones);
  const removeZone = useServerFn(deleteZone);

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

  const zones = data?.zones ?? [];

  const deleteMutation = useMutation({
    mutationFn: (zone_id: number) => removeZone({ data: { zone_id } } as never),
    onSuccess: async () => {
      setDeleting(null);
      await queryClient.invalidateQueries({ queryKey: ["zones"] });
      await queryClient.invalidateQueries({ queryKey: ["zone-audit-logs"] });
      toast.success("Zone deleted");
    },
    onError: (e: Error) => toast.error(e.message || "Could not delete zone"),
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
    <PortalLayout
      roles={["admin"]}
      title="Zone Management"
      description="Geographic zones used to organise routes and streets"
      actions={
        <div className="flex flex-wrap items-center gap-2">
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
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total zones</span>
            <MapPin className="size-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold">{zones.length}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Zones with routes</span>
            <CheckCircle2 className="size-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold">{withRoutes}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total routes</span>
            <RouteIcon className="size-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-bold">{totalRoutes}</div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
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

      <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-3" />
              <th className="px-4 py-3 text-left">Zone</th>
              <th className="px-4 py-3 text-left">Description</th>
              <th className="px-4 py-3 text-left">Routes</th>
              <th className="px-4 py-3 text-left">Created</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto size-5 animate-spin" />
                </td>
              </tr>
            )}
            {!isLoading && !rows.length && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
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
                <td className="px-4 py-3">{z.route_count}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(z.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
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
                  <td colSpan={6} className="p-3">
                    <RouteManager zoneId={z.zone_id} zoneName={z.zone_name} />
                  </td>
                </tr>
              )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Deleting a zone also deletes its routes and streets (cascade). Expand a zone to manage its
        routes and streets inline.
      </p>

      <div className="mt-6">
        <ZoneAuditViewer />
      </div>

      {importing && (
        <ZoneImportDialog
          onClose={() => setImporting(false)}
          onImported={async () => {
            await queryClient.invalidateQueries({ queryKey: ["zones"] });
            await queryClient.invalidateQueries({ queryKey: ["zone-audit-logs"] });
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
            await queryClient.invalidateQueries({ queryKey: ["zone-audit-logs"] });
            toast.success(wasEdit ? "Zone updated" : "Zone added");
          }}
        />
      )}

      {deleting && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="zone-delete-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleting(null);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-lg">
            <h2 id="zone-delete-title" className="text-lg font-bold">
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
    </PortalLayout>
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
  const hasErrors = Boolean(nameError);

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
      aria-labelledby="zone-dialog-title"
    >
      <div className="my-8 w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-lg">
        <h2 id="zone-dialog-title" className="text-lg font-bold">
          {isEdit ? "Edit Zone" : "Add Zone"}
        </h2>
        <p className="text-sm text-muted-foreground">
          Zones group routes and streets for meter and field-operations management.
        </p>

        <div className="mt-4 grid gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="zone-name">
              Zone name
            </label>
            <input
              id="zone-name"
              value={form.zone_name}
              onChange={(e) => setForm((p) => ({ ...p, zone_name: e.target.value }))}
              aria-invalid={Boolean(nameError)}
              className={field}
            />
            {nameError && <p className="mt-1 text-xs text-destructive">{nameError}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="zone-desc">
              Description <span className="text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="zone-desc"
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
            disabled={hasErrors || mutation.isPending}
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
