import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import {
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  Pagination,
  StatCard,
  StatusBadge,
  formatDate,
  installationLabel,
  useVendorScope,
} from "@/components/vendor/VendorUI";
import {
  DEACTIVATION_REASONS,
  activateVendorMeter,
  deactivateVendorMeter,
  listActivationHistory,
} from "@/lib/vendor-ops.functions";

const PAGE_SIZE = 10;

export const Route = createFileRoute("/_authenticated/vendor/activation")({
  head: () => ({
    meta: [
      { title: "Meter Activation · Vendor · SmatraPay" },
      {
        name: "description",
        content: "Activate and deactivate prepaid meters assigned to your vendor account.",
      },
      { property: "og:title", content: "Meter Activation · Vendor · SmatraPay" },
      {
        property: "og:description",
        content: "Activate installed prepaid meters and record deactivation reasons.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorActivation,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{error.message}</p>,
});

function VendorActivation() {
  const access = Route.useLoaderData();
  const queryClient = useQueryClient();
  const scope = useVendorScope();
  const fetchHistory = useServerFn(listActivationHistory);
  const activate = useServerFn(activateVendorMeter);
  const deactivate = useServerFn(deactivateVendorMeter);

  const history = useQuery({
    queryKey: ["vendor-activation-history"],
    queryFn: () => fetchHistory({ data: {} }),
  });

  const [search, setSearch] = useState("");
  const [zone, setZone] = useState("all");
  const [resident, setResident] = useState("all");
  const [type, setType] = useState("all");
  const [activation, setActivation] = useState("all");
  const [installation, setInstallation] = useState("all");
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState<{ id: string; number: string } | null>(null);
  const [deactivating, setDeactivating] = useState<{ id: string; number: string } | null>(null);
  const [reason, setReason] = useState<(typeof DEACTIVATION_REASONS)[number]>("Faulty Meter");
  const [notes, setNotes] = useState("");

  const meters = scope.data?.meters ?? [];
  const lastActivation = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of history.data?.entries ?? []) {
      if (entry.action === "activated" && !map.has(entry.meter_id)) map.set(entry.meter_id, entry.created_at);
    }
    return map;
  }, [history.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return meters.filter((m) => {
      if (q && ![m.meter_number, m.serial_number].some((v) => v.toLowerCase().includes(q))) return false;
      if (zone !== "all" && String(m.zone_id ?? "") !== zone) return false;
      if (resident !== "all" && (m.resident_id ?? "") !== resident) return false;
      if (type !== "all" && m.type !== type) return false;
      if (activation !== "all" && (m.status === "active" ? "active" : "inactive") !== activation) return false;
      if (installation !== "all" && m.installation_status !== installation) return false;
      return true;
    });
  }, [meters, search, zone, resident, type, activation, installation]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["vendor-scope"] }),
      queryClient.invalidateQueries({ queryKey: ["vendor-activation-history"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    ]);
  };

  const activateMutation = useMutation({
    mutationFn: (meterId: string) => activate({ data: { meter_id: meterId } }),
    onSuccess: async () => {
      setConfirm(null);
      await refresh();
      toast.success("Meter activated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deactivateMutation = useMutation({
    mutationFn: (input: { meter_id: string; reason: (typeof DEACTIVATION_REASONS)[number]; notes?: string }) =>
      deactivate({ data: input }),
    onSuccess: async () => {
      setDeactivating(null);
      setNotes("");
      await refresh();
      toast.success("Meter deactivated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const zones = scope.data?.zones ?? [];
  const residents = scope.data?.residents ?? [];
  const eligible = meters.filter(
    (m) => m.status !== "active" && m.installation_status === "installed" && m.unit_id,
  ).length;

  return (
    <DashboardShell
      access={access}
      title="Meter Activation"
      description="Activate installed prepaid meters and manage deactivations."
    >
      {scope.error ? (
        <ErrorBlock message={(scope.error as Error).message} />
      ) : scope.isLoading ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-4 pb-8">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total meters" value={meters.length} />
            <StatCard label="Active" value={meters.filter((m) => m.status === "active").length} />
            <StatCard label="Eligible for activation" value={eligible} />
            <StatCard
              label="Awaiting installation"
              value={meters.filter((m) => m.installation_status !== "installed").length}
            />
          </div>

          <div className="grid gap-2 rounded-2xl border border-border bg-card p-3 md:grid-cols-3 xl:grid-cols-6">
            <input
              className="input"
              placeholder="Search meter or serial"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              aria-label="Search meters"
            />
            <select className="input" value={zone} onChange={(e) => setZone(e.target.value)} aria-label="Zone">
              <option value="all">All zones</option>
              {zones.map((z) => (
                <option key={z.zone_id} value={String(z.zone_id)}>
                  {z.zone_name}
                </option>
              ))}
            </select>
            <select
              className="input"
              value={resident}
              onChange={(e) => setResident(e.target.value)}
              aria-label="Resident"
            >
              <option value="all">All residents</option>
              {residents.map((r) => (
                <option key={`${r.id}-${r.unit_id}`} value={r.id}>
                  {r.name ?? r.email}
                </option>
              ))}
            </select>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)} aria-label="Meter type">
              <option value="all">All types</option>
              <option value="electricity">Electricity</option>
              <option value="water">Water</option>
              <option value="gas">Gas</option>
            </select>
            <select
              className="input"
              value={activation}
              onChange={(e) => setActivation(e.target.value)}
              aria-label="Activation status"
            >
              <option value="all">Any activation status</option>
              <option value="active">Activated</option>
              <option value="inactive">Not activated</option>
            </select>
            <select
              className="input"
              value={installation}
              onChange={(e) => setInstallation(e.target.value)}
              aria-label="Installation status"
            >
              <option value="all">Any installation status</option>
              <option value="not_installed">Not installed</option>
              <option value="scheduled">Scheduled</option>
              <option value="installed">Installed</option>
              <option value="failed">Failed</option>
              <option value="replaced">Replaced</option>
            </select>
          </div>

          {current.length === 0 ? (
            <EmptyState title="No meters" message="No meters match the selected filters." />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full min-w-[62rem] text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Meter</th>
                    <th className="px-4 py-3">Serial</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Resident</th>
                    <th className="px-4 py-3">Zone</th>
                    <th className="px-4 py-3">Installation</th>
                    <th className="px-4 py-3">Meter status</th>
                    <th className="px-4 py-3">Activation</th>
                    <th className="px-4 py-3">Activated on</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {current.map((m) => {
                    const canActivate =
                      m.status !== "active" && m.installation_status === "installed" && !!m.unit_id;
                    return (
                      <tr key={m.id} className="border-t border-border">
                        <td className="px-4 py-3 font-semibold text-foreground">{m.meter_number}</td>
                        <td className="px-4 py-3 text-muted-foreground">{m.serial_number}</td>
                        <td className="px-4 py-3 text-muted-foreground">{m.type}</td>
                        <td className="px-4 py-3 text-muted-foreground">{m.resident_name ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{m.zone_name ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {installationLabel(m.installation_status)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge value={m.status} />
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge value={m.status === "active" ? "activated" : "pending"} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDate(lastActivation.get(m.id))}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {m.status === "active" ? (
                            <button
                              className="btn-outline px-3 py-1 text-xs"
                              onClick={() => setDeactivating({ id: m.id, number: m.meter_number })}
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button
                              className="btn-primary px-3 py-1 text-xs disabled:opacity-50"
                              disabled={!canActivate}
                              title={
                                canActivate
                                  ? "Activate meter"
                                  : "The meter must be assigned to a unit and installed first"
                              }
                              onClick={() => setConfirm({ id: m.id, number: m.meter_number })}
                            >
                              Activate
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Pagination page={page} pageCount={pageCount} onPage={setPage} total={filtered.length} />
            </div>
          )}

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-bold text-foreground">Recent activation history</h2>
            {history.isLoading ? (
              <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
            ) : (history.data?.entries.length ?? 0) === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No activation records yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {(history.data?.entries ?? []).slice(0, 10).map((e) => {
                  const meter = meters.find((m) => m.id === e.meter_id);
                  return (
                    <li key={e.id} className="rounded-xl border border-border p-3 text-sm">
                      <p className="font-semibold text-foreground">
                        {meter?.meter_number ?? "Meter"} — {e.action}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {e.previous_status ?? "—"} → {e.new_status ?? "—"} · {formatDate(e.created_at)}
                        {e.reason ? ` · ${e.reason}` : ""}
                        {e.actor_name ? ` · by ${e.actor_name}` : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {confirm && (
        <Modal title="Activate meter" onClose={() => setConfirm(null)}>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to activate meter {confirm.number}?
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-outline px-3 py-1.5 text-sm" onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button
              className="btn-primary px-3 py-1.5 text-sm"
              disabled={activateMutation.isPending}
              onClick={() => activateMutation.mutate(confirm.id)}
            >
              {activateMutation.isPending ? "Activating…" : "Activate meter"}
            </button>
          </div>
        </Modal>
      )}

      {deactivating && (
        <Modal title="Deactivate meter" onClose={() => setDeactivating(null)}>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to deactivate meter {deactivating.number}?
          </p>
          <label className="mt-4 block text-xs font-semibold uppercase text-muted-foreground">
            Reason
            <select
              className="input mt-1"
              value={reason}
              onChange={(e) => setReason(e.target.value as (typeof DEACTIVATION_REASONS)[number])}
            >
              {DEACTIVATION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 block text-xs font-semibold uppercase text-muted-foreground">
            Notes (optional)
            <textarea
              className="input mt-1"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-outline px-3 py-1.5 text-sm" onClick={() => setDeactivating(null)}>
              Cancel
            </button>
            <button
              className="btn-primary px-3 py-1.5 text-sm"
              disabled={deactivateMutation.isPending}
              onClick={() =>
                deactivateMutation.mutate({
                  meter_id: deactivating.id,
                  reason,
                  ...(notes.trim() ? { notes: notes.trim() } : {}),
                })

              }
            >
              {deactivateMutation.isPending ? "Saving…" : "Deactivate meter"}
            </button>
          </div>
        </Modal>
      )}
    </DashboardShell>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">{title}</h2>
          <button className="text-sm text-muted-foreground" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
