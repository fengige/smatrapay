import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Power,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import {
  addRoute,
  addStreet,
  bulkDeleteStreets,
  deleteRoute,
  deleteStreet,
  listRoutes,
  listStreets,
  setRouteStatus,
  updateRoute,
  updateStreet,
  type RouteRow,
  type StreetRow,
} from "@/lib/zones.functions";
import { StreetImportDialog } from "@/components/zones/StreetImportDialog";

const field = "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm";
const btn =
  "inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent/10";
const primaryBtn =
  "inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60";

export function RouteManager({ zoneId, zoneName }: { zoneId: number; zoneName: string }) {
  const queryClient = useQueryClient();
  const fetchRoutes = useServerFn(listRoutes);
  const removeRoute = useServerFn(deleteRoute);
  const toggleStatus = useServerFn(setRouteStatus);

  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RouteRow | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["zone-routes", zoneId],
    queryFn: () => fetchRoutes({ data: { zone_id: zoneId } } as never),
  });

  const routes = (data?.routes ?? []) as RouteRow[];
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return routes;
    return routes.filter((r) =>
      [r.route_code, r.route_name, r.status].join(" ").toLowerCase().includes(needle),
    );
  }, [routes, q]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["zone-routes", zoneId] });
    await queryClient.invalidateQueries({ queryKey: ["zones"] });
  };

  const deleteMutation = useMutation({
    mutationFn: (route_id: number) => removeRoute({ data: { route_id } } as never),
    onSuccess: async () => {
      await invalidate();
      toast.success("Route deleted");
    },
    onError: (e: Error) => toast.error(e.message || "Could not delete route"),
  });

  const statusMutation = useMutation({
    mutationFn: (vars: { route_id: number; status: "Active" | "Inactive" }) =>
      toggleStatus({ data: vars } as never),
    onSuccess: async (_r, vars) => {
      await invalidate();
      toast.success(
        vars.status === "Active" ? "Route activated" : "Route deactivated",
      );
    },
    onError: (e: Error) => toast.error(e.message || "Could not update route status"),
  });

  return (
    <div className="rounded-xl border border-border bg-background/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Routes in {zoneName}</h3>
          <p className="text-xs text-muted-foreground">
            Create, edit and delete routes and their streets without leaving this page.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search routes"
              aria-label={`Search routes in ${zoneName}`}
              className="h-9 w-48 rounded-lg border border-border bg-background pl-8 pr-3 text-xs"
            />
          </div>
          <button
            type="button"
            className={primaryBtn}
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            <Plus className="size-3.5" /> Add Route
          </button>
        </div>
      </div>

      {showForm && (
        <RouteForm
          zoneId={zoneId}
          route={editing}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSaved={async () => {
            const wasEdit = Boolean(editing);
            setShowForm(false);
            setEditing(null);
            await invalidate();
            toast.success(wasEdit ? "Route updated" : "Route added");
          }}
        />
      )}

      <div className="mt-3 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-2" />
              <th className="px-3 py-2 text-left">Code</th>
              <th className="px-3 py-2 text-left">Route name</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Streets</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  <Loader2 className="mx-auto size-4 animate-spin" />
                </td>
              </tr>
            )}
            {!isLoading && !rows.length && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No routes yet for this zone. Use “Add Route” to create one.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.route_id} className="border-t border-border/70 align-top">
                <td className="px-2 py-2">
                  <button
                    type="button"
                    aria-expanded={expanded === r.route_id}
                    aria-label={`${expanded === r.route_id ? "Hide" : "Show"} streets for ${r.route_code}`}
                    onClick={() => setExpanded((p) => (p === r.route_id ? null : r.route_id))}
                    className="rounded p-1 hover:bg-accent/10"
                  >
                    {expanded === r.route_id ? (
                      <ChevronDown className="size-4" />
                    ) : (
                      <ChevronRight className="size-4" />
                    )}
                  </button>
                </td>
                <td className="px-3 py-2 font-medium">{r.route_code}</td>
                <td className="px-3 py-2">{r.route_name}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      r.status === "Active"
                        ? "bg-emerald-500/10 text-emerald-600"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-3 py-2">{r.street_count}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className={btn}
                      onClick={() => {
                        setEditing(r);
                        setShowForm(true);
                      }}
                    >
                      <Pencil className="size-3.5" /> Edit
                    </button>
                    <button
                      type="button"
                      className={`${btn} ${
                        r.status === "Active"
                          ? "border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
                          : "border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10"
                      }`}
                      disabled={statusMutation.isPending}
                      aria-label={
                        r.status === "Active"
                          ? `Deactivate route ${r.route_code}`
                          : `Activate route ${r.route_code}`
                      }
                      onClick={() => {
                        const next = r.status === "Active" ? "Inactive" : "Active";
                        if (
                          window.confirm(
                            next === "Inactive"
                              ? `Deactivate route ${r.route_code}? It will remain listed but flagged inactive.`
                              : `Activate route ${r.route_code}?`,
                          )
                        ) {
                          statusMutation.mutate({ route_id: r.route_id, status: next });
                        }
                      }}
                    >
                      {statusMutation.isPending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Power className="size-3.5" />
                      )}
                      {r.status === "Active" ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      type="button"
                      className={`${btn} border-destructive/40 text-destructive hover:bg-destructive/10`}
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete route ${r.route_code}? Its ${r.street_count} street(s) will also be removed.`,
                          )
                        ) {
                          deleteMutation.mutate(r.route_id);
                        }
                      }}
                    >
                      <Trash2 className="size-3.5" /> Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.map(
              (r) =>
                expanded === r.route_id && (
                  <tr key={`streets-${r.route_id}`} className="border-t border-border/70 bg-muted/20">
                    <td colSpan={6} className="p-3">
                      <StreetsManager routeId={r.route_id} routeCode={r.route_code} zoneId={zoneId} />
                    </td>
                  </tr>
                ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RouteForm({
  zoneId,
  route,
  onClose,
  onSaved,
}: {
  zoneId: number;
  route: RouteRow | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const create = useServerFn(addRoute);
  const edit = useServerFn(updateRoute);
  const [form, setForm] = useState({
    route_code: route?.route_code ?? "",
    route_name: route?.route_name ?? "",
    status: route?.status === "Inactive" ? "Inactive" : "Active",
  });

  const codeError =
    form.route_code.trim().length < 2
      ? "Route code is required (min 2 characters)"
      : form.route_code.trim().length > 20
        ? "Route code cannot exceed 20 characters"
        : null;
  const nameError =
    form.route_name.trim().length < 2 ? "Route name is required (min 2 characters)" : null;

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        zone_id: zoneId,
        route_code: form.route_code.trim().toUpperCase(),
        route_name: form.route_name.trim(),
        status: form.status,
      };
      if (route) await edit({ data: { ...payload, route_id: route.route_id } } as never);
      else await create({ data: payload } as never);
    },
    onSuccess: () => onSaved(),
    onError: (e: Error) => toast.error(e.message || "Could not save route"),
  });

  return (
    <div className="mt-3 grid gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-4">
      <div>
        <label className="mb-1 block text-xs font-medium" htmlFor="route-code">
          Route code
        </label>
        <input
          id="route-code"
          value={form.route_code}
          onChange={(e) => setForm((p) => ({ ...p, route_code: e.target.value }))}
          aria-invalid={Boolean(codeError)}
          className={field}
        />
        {codeError && <p className="mt-1 text-[11px] text-destructive">{codeError}</p>}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium" htmlFor="route-name">
          Route name
        </label>
        <input
          id="route-name"
          value={form.route_name}
          onChange={(e) => setForm((p) => ({ ...p, route_name: e.target.value }))}
          aria-invalid={Boolean(nameError)}
          className={field}
        />
        {nameError && <p className="mt-1 text-[11px] text-destructive">{nameError}</p>}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium" htmlFor="route-status">
          Status
        </label>
        <select
          id="route-status"
          value={form.status}
          onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
          className={field}
        >
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
      </div>
      <div className="flex items-end gap-2">
        <button
          type="button"
          disabled={Boolean(codeError || nameError) || mutation.isPending}
          onClick={() => mutation.mutate()}
          className={primaryBtn}
        >
          {mutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
          {route ? "Save route" : "Add route"}
        </button>
        <button type="button" onClick={onClose} className={btn}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function StreetsManager({
  routeId,
  routeCode,
  zoneId,
}: {
  routeId: number;
  routeCode: string;
  zoneId: number;
}) {
  const queryClient = useQueryClient();
  const fetchStreets = useServerFn(listStreets);
  const create = useServerFn(addStreet);
  const edit = useServerFn(updateStreet);
  const remove = useServerFn(deleteStreet);
  const bulkRemove = useServerFn(bulkDeleteStreets);

  const [q, setQ] = useState("");
  const [form, setForm] = useState({ street_name: "", postal_code: "" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["route-streets", routeId],
    queryFn: () => fetchStreets({ data: { route_id: routeId } } as never),
  });

  const streets = (data?.streets ?? []) as StreetRow[];
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return streets;
    return streets.filter((s) =>
      [s.street_name, s.postal_code ?? ""].join(" ").toLowerCase().includes(needle),
    );
  }, [streets, q]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["route-streets", routeId] });
    await queryClient.invalidateQueries({ queryKey: ["zone-routes", zoneId] });
  };

  const nameError =
    form.street_name.trim().length > 0 && form.street_name.trim().length < 2
      ? "Street name must be at least 2 characters"
      : form.street_name.trim().length > 150
        ? "Street name cannot exceed 150 characters"
        : null;
  const postalError =
    form.postal_code.trim().length > 20 ? "Postal code cannot exceed 20 characters" : null;
  const duplicate = streets.some(
    (s) =>
      s.street_id !== editingId &&
      s.street_name.trim().toLowerCase() === form.street_name.trim().toLowerCase() &&
      form.street_name.trim().length > 0,
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        route_id: routeId,
        street_name: form.street_name.trim(),
        postal_code: form.postal_code.trim() || null,
      };
      if (editingId) await edit({ data: { ...payload, street_id: editingId } } as never);
      else await create({ data: payload } as never);
    },
    onSuccess: async () => {
      setForm({ street_name: "", postal_code: "" });
      setEditingId(null);
      await invalidate();
      toast.success("Street saved");
    },
    onError: (e: Error) => toast.error(e.message || "Could not save street"),
  });

  const deleteMutation = useMutation({
    mutationFn: (street_id: number) => remove({ data: { street_id } } as never),
    onSuccess: async () => {
      await invalidate();
      toast.success("Street deleted");
    },
    onError: (e: Error) => toast.error(e.message || "Could not delete street"),
  });

  const selectedStreets = streets.filter((s) => selected.has(s.street_id));

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) =>
      bulkRemove({ data: { route_id: routeId, street_ids: ids } } as never),
    onSuccess: async (_r, ids) => {
      setSelected(new Set());
      setConfirmBulkDelete(false);
      await invalidate();
      toast.success(`${ids.length} street${ids.length === 1 ? "" : "s"} deleted`);
    },
    onError: (e: Error) => toast.error(e.message || "Could not delete selected streets"),
  });

  const toggleSelect = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allVisibleSelected = rows.length > 0 && rows.every((s) => selected.has(s.street_id));
  const toggleSelectAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) rows.forEach((s) => next.delete(s.street_id));
      else rows.forEach((s) => next.add(s.street_id));
      return next;
    });

  const canSave =
    form.street_name.trim().length >= 2 && !nameError && !postalError && !duplicate;

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Streets on {routeCode}
        </h4>
        <div className="flex flex-wrap items-center gap-2">
          {selected.size > 0 && (
            <button
              type="button"
              className={`${btn} border-destructive/40 text-destructive hover:bg-destructive/10`}
              disabled={bulkDeleteMutation.isPending}
              onClick={() => setConfirmBulkDelete(true)}
            >
              {bulkDeleteMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              Delete selected ({selected.size})
            </button>
          )}
          <button type="button" className={btn} onClick={() => setShowImport(true)}>
            <Upload className="size-3.5" /> Import CSV
          </button>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search streets"
              aria-label={`Search streets on ${routeCode}`}
              className="h-9 w-48 rounded-lg border border-border bg-background pl-8 pr-3 text-xs"
            />
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
        <div>
          <input
            value={form.street_name}
            onChange={(e) => setForm((p) => ({ ...p, street_name: e.target.value }))}
            placeholder="Street name"
            aria-label="Street name"
            aria-invalid={Boolean(nameError || duplicate)}
            className={field}
          />
          {(nameError || duplicate) && (
            <p className="mt-1 text-[11px] text-destructive">
              {nameError ?? "This street already exists on the route"}
            </p>
          )}
        </div>
        <div>
          <input
            value={form.postal_code}
            onChange={(e) => setForm((p) => ({ ...p, postal_code: e.target.value }))}
            placeholder="Postal code (optional)"
            aria-label="Postal code"
            aria-invalid={Boolean(postalError)}
            className={field}
          />
          {postalError && <p className="mt-1 text-[11px] text-destructive">{postalError}</p>}
        </div>
        <div className="flex items-start gap-2">
          <button
            type="button"
            disabled={!canSave || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            className={primaryBtn}
          >
            {saveMutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
            {editingId ? "Save street" : "Add street"}
          </button>
          {editingId && (
            <button
              type="button"
              className={btn}
              onClick={() => {
                setEditingId(null);
                setForm({ street_name: "", postal_code: "" });
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-2">
                <input
                  type="checkbox"
                  aria-label={allVisibleSelected ? "Deselect all streets" : "Select all streets"}
                  checked={allVisibleSelected}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="px-3 py-2 text-left">Street</th>
              <th className="px-3 py-2 text-left">Postal code</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-3 py-5 text-center text-muted-foreground">
                  <Loader2 className="mx-auto size-4 animate-spin" />
                </td>
              </tr>
            )}
            {!isLoading && !rows.length && (
              <tr>
                <td colSpan={4} className="px-3 py-5 text-center text-xs text-muted-foreground">
                  No streets recorded for this route yet.
                </td>
              </tr>
            )}
            {rows.map((s) => (
              <tr key={s.street_id} className="border-t border-border/70">
                <td className="px-2 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Select street ${s.street_name}`}
                    checked={selected.has(s.street_id)}
                    onChange={() => toggleSelect(s.street_id)}
                  />
                </td>
                <td className="px-3 py-2">{s.street_name}</td>
                <td className="px-3 py-2 text-muted-foreground">{s.postal_code ?? "—"}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className={btn}
                      onClick={() => {
                        setEditingId(s.street_id);
                        setForm({
                          street_name: s.street_name,
                          postal_code: s.postal_code ?? "",
                        });
                      }}
                    >
                      <Pencil className="size-3.5" /> Edit
                    </button>
                    <button
                      type="button"
                      className={`${btn} border-destructive/40 text-destructive hover:bg-destructive/10`}
                      onClick={() => {
                        if (window.confirm(`Delete street “${s.street_name}”?`)) {
                          deleteMutation.mutate(s.street_id);
                        }
                      }}
                    >
                      <Trash2 className="size-3.5" /> Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showImport && (
        <StreetImportDialog
          routeId={routeId}
          routeCode={routeCode}
          onClose={() => setShowImport(false)}
          onImported={async () => {
            await invalidate();
          }}
        />
      )}

      {confirmBulkDelete && (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-delete-streets-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !bulkDeleteMutation.isPending) {
              setConfirmBulkDelete(false);
            }
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-lg">
            <h2 id="bulk-delete-streets-title" className="text-lg font-bold">
              Delete {selectedStreets.length} street{selectedStreets.length === 1 ? "" : "s"}?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The following streets will be permanently removed from route {routeCode}. This cannot
              be undone.
            </p>
            <ul className="mt-3 max-h-48 list-disc overflow-y-auto rounded-lg border border-border p-3 pl-7 text-sm">
              {selectedStreets.map((s) => (
                <li key={s.street_id}>
                  {s.street_name}
                  {s.postal_code ? (
                    <span className="text-muted-foreground"> ({s.postal_code})</span>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className={btn}
                disabled={bulkDeleteMutation.isPending}
                onClick={() => setConfirmBulkDelete(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkDeleteMutation.isPending || !selectedStreets.length}
                onClick={() =>
                  bulkDeleteMutation.mutate(selectedStreets.map((s) => s.street_id))
                }
                className="inline-flex items-center gap-2 rounded-lg bg-destructive px-3.5 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90 disabled:opacity-60"
              >
                {bulkDeleteMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                Delete {selectedStreets.length} street{selectedStreets.length === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
