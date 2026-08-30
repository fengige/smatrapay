import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Gauge, Loader2, Plus, Search, Unlink, X } from "lucide-react";
import { toast } from "sonner";

import { AssignmentHistorySection } from "@/components/AssignmentHistorySection";

import {
  assignMetersToAgent,
  listAgentMeters,
  listAssignableAgentMeters,
  unassignMetersFromAgent,
} from "@/lib/agents.functions";
import {
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
  assignMetersToVendor,
  listAssignableVendorMeters,
  listVendorMeters,
  unassignMetersFromVendor,
} from "@/lib/vendors.functions";

type MeterResult = { id: string; meter_number: string; ok: boolean; reason?: string };

type Kind = "agent" | "vendor";

type AssignableMeter = {
  id: string;
  meter_number: string;
  serial_number: string;
  type: string;
  status: string;
  landlord_id: string | null;
  agent_id: string | null;
  vendor_id: string | null;
};

type OwnedMeter = {
  id: string;
  meter_number: string;
  serial_number: string;
  type: string;
  price_per_unit: number;
  status: string;
};

export function MeterAssignmentPanel({
  kind,
  ownerId,
  ownerName,
}: {
  kind: Kind;
  ownerId: string;
  ownerName: string;
}) {
  const queryClient = useQueryClient();
  const isAgent = kind === "agent";

  const listOwned = useServerFn(isAgent ? listAgentMeters : (listVendorMeters as never));
  const listAssignable = useServerFn(
    isAgent ? listAssignableAgentMeters : (listAssignableVendorMeters as never),
  );
  const assign = useServerFn(isAgent ? assignMetersToAgent : (assignMetersToVendor as never));
  const unassign = useServerFn(
    isAgent ? unassignMetersFromAgent : (unassignMetersFromVendor as never),
  );

  const ownerArg = (extra: Record<string, unknown> = {}) =>
    (isAgent ? { agentId: ownerId, ...extra } : { vendorId: ownerId, ...extra }) as never;

  const ownedKey = [`${kind}-meters`, ownerId];

  const { data, isLoading } = useQuery({
    queryKey: ownedKey,
    queryFn: () => (listOwned as unknown as (o: { data: unknown }) => Promise<{ meters: OwnedMeter[] }>)({
      data: ownerArg(),
    }),
  });

  const meters = data?.meters ?? [];

  const [selected, setSelected] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmUnassign, setConfirmUnassign] = useState(false);
  const [search, setSearch] = useState("");
  const [pickerSelected, setPickerSelected] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [results, setResults] = useState<{ title: string; rows: MeterResult[] } | null>(null);

  useEffect(() => {
    if (!dialogOpen) {
      setSearch("");
      setPickerSelected([]);
      setStatusFilter("all");
      setTypeFilter("all");
    }
  }, [dialogOpen]);

  useEffect(() => {
    if (!dialogOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDialogOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialogOpen]);

  const { data: assignableData, isLoading: assignableLoading } = useQuery({
    queryKey: [`assignable-${kind}-meters`],
    queryFn: () =>
      (listAssignable as unknown as (o: { data: unknown }) => Promise<{ meters: AssignableMeter[] }>)({
        data: {} as never,
      }),
    enabled: dialogOpen,
  });

  const allAssignable = assignableData?.meters ?? [];

  const statusOptions = useMemo(
    () => [...new Set(allAssignable.map((m) => m.status).filter(Boolean))].sort(),
    [allAssignable],
  );
  const typeOptions = useMemo(
    () => [...new Set(allAssignable.map((m) => m.type).filter(Boolean))].sort(),
    [allAssignable],
  );

  const assignable = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allAssignable.filter((m) => {
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (typeFilter !== "all" && m.type !== typeFilter) return false;
      if (!q) return true;
      return (
        m.meter_number.toLowerCase().includes(q) ||
        (m.serial_number ?? "").toLowerCase().includes(q) ||
        (m.type ?? "").toLowerCase().includes(q) ||
        (m.status ?? "").toLowerCase().includes(q)
      );
    });
  }, [allAssignable, search, statusFilter, typeFilter]);

  const conflictOf = (m: AssignableMeter) => {
    if (m.landlord_id) return "Held by a landlord";
    if (isAgent && m.vendor_id) return "Held by a vendor";
    if (!isAgent && m.agent_id) return "Held by an agent";
    return null;
  };

  const blockedSelection = useMemo(
    () =>
      allAssignable.filter((m) => pickerSelected.includes(m.id) && conflictOf(m)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allAssignable, pickerSelected],
  );

  useRealtimeRefresh(
    `${kind}-meters`,
    ["meters", "meter_audit_logs"],
    [ownedKey, [`assignable-${kind}-meters`], [`${kind}-assignment-history`, ownerId]],
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ownedKey });
    queryClient.invalidateQueries({ queryKey: [`assignable-${kind}-meters`] });
    queryClient.invalidateQueries({ queryKey: [`${kind}-assignment-history`, ownerId] });
  };

  const assignMutation = useMutation({
    mutationFn: () =>
      (assign as unknown as (
        o: { data: unknown },
      ) => Promise<{ assigned: number; skipped: string[]; results: MeterResult[] }>)({
        data: ownerArg({ meterIds: pickerSelected }),
      }),
    onSuccess: (res) => {
      toast.success(
        `${res.assigned} meter${res.assigned === 1 ? "" : "s"} registered to ${ownerName}`,
        res.skipped.length > 0
          ? { description: `Skipped (already registered): ${res.skipped.join(", ")}` }
          : undefined,
      );
      setResults({ title: "Registration results", rows: res.results });
      refresh();
      setDialogOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unassignMutation = useMutation({
    mutationFn: () =>
      (unassign as unknown as (
        o: { data: unknown },
      ) => Promise<{ unassigned: number; results: MeterResult[] }>)({
        data: ownerArg({ meterIds: selected }),
      }),
    onSuccess: (res) => {
      toast.success(`${res.unassigned} meter${res.unassigned === 1 ? "" : "s"} unassigned`);
      setResults({ title: "Unassign results", rows: res.results });
      setSelected([]);
      setConfirmUnassign(false);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const allSelected = meters.length > 0 && selected.length === meters.length;

  return (
    <section className="rounded-2xl border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div className="flex items-center gap-2">
          <Gauge className="size-4 text-primary" />
          <h3 className="text-base font-bold text-foreground">Meters</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmUnassign(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-destructive/40 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10"
            >
              <Unlink className="size-4" />
              Unassign {selected.length}
            </button>
          )}
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="size-4" />
            Register meters
          </button>
        </div>
      </header>

      {isLoading ? (
        <div className="flex justify-center p-10 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : meters.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-10 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Gauge className="size-8" />
          </span>
          <p className="text-sm font-semibold text-foreground">No meters assigned</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Use “Register meters” to assign meters to this {kind}.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-6 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all meters"
                    checked={allSelected}
                    onChange={(e) => setSelected(e.target.checked ? meters.map((m) => m.id) : [])}
                  />
                </th>
                <th className="px-6 py-3 font-semibold">Meter no.</th>
                <th className="px-6 py-3 font-semibold">Serial</th>
                <th className="px-6 py-3 font-semibold">Type</th>
                <th className="px-6 py-3 font-semibold">Price / unit</th>
                <th className="px-6 py-3 font-semibold">Status</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {meters.map((m) => (
                <tr key={m.id} className="hover:bg-accent/5">
                  <td className="px-6 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select meter ${m.meter_number}`}
                      checked={selected.includes(m.id)}
                      onChange={(e) =>
                        setSelected((prev) =>
                          e.target.checked ? [...prev, m.id] : prev.filter((id) => id !== m.id),
                        )
                      }
                    />
                  </td>
                  <td className="px-6 py-3 font-medium text-foreground">{m.meter_number}</td>
                  <td className="px-6 py-3 text-muted-foreground">{m.serial_number}</td>
                  <td className="px-6 py-3 capitalize text-muted-foreground">{m.type}</td>
                  <td className="px-6 py-3 text-muted-foreground">{m.price_per_unit}</td>
                  <td className="px-6 py-3 capitalize text-muted-foreground">{m.status}</td>
                  <td className="px-6 py-3 text-right">
                    <Link
                      to="/meters/$meterId"
                      params={{ meterId: m.id }}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmUnassign && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm unassign meters"
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h4 className="text-base font-bold text-foreground">Unassign meters?</h4>
            <p className="mt-2 text-sm text-muted-foreground">
              {selected.length} meter{selected.length === 1 ? "" : "s"} will no longer be registered
              to {ownerName}. The meters themselves are not deleted.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmUnassign(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent/10"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={unassignMutation.isPending}
                onClick={() => unassignMutation.mutate()}
                className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50"
              >
                {unassignMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                Unassign
              </button>
            </div>
          </div>
        </div>
      )}

      {dialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Register meters"
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDialogOpen(false);
          }}
        >
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <header className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
              <h4 className="text-base font-bold text-foreground">Register meters</h4>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setDialogOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent/10 hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </header>

            <div className="border-b border-border px-6 py-4">
              <p className="text-xs text-muted-foreground">
                Select unassigned meters to register to{" "}
                <span className="font-semibold">{ownerName}</span>.
              </p>
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search meter or serial number…"
                  className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                <label className="text-xs text-muted-foreground">
                  Status
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="ml-2 rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                  >
                    <option value="all">All</option>
                    {statusOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-muted-foreground">
                  Model / type
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="ml-2 rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                  >
                    <option value="all">All</option>
                    {typeOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {blockedSelection.length > 0 && (
                <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {blockedSelection.length} selected meter
                  {blockedSelection.length === 1 ? " is" : "s are"} already registered elsewhere:{" "}
                  {blockedSelection.map((m) => `${m.meter_number} (${conflictOf(m)})`).join(", ")}
                </p>
              )}
            </div>

            <div className="min-h-40 flex-1 overflow-y-auto">
              {assignableLoading ? (
                <div className="flex justify-center p-10 text-muted-foreground">
                  <Loader2 className="size-5 animate-spin" />
                </div>
              ) : assignable.length === 0 ? (
                <p className="p-10 text-center text-sm text-muted-foreground">
                  No unassigned meters available.
                </p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 border-b border-border bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label="Select all listed meters"
                          checked={
                            assignable.length > 0 &&
                            assignable.every((m) => pickerSelected.includes(m.id))
                          }
                          onChange={(e) =>
                            setPickerSelected(
                              e.target.checked
                                ? Array.from(
                                    new Set([
                                      ...pickerSelected,
                                      ...assignable.filter((m) => !conflictOf(m)).map((m) => m.id),
                                    ]),
                                  )
                                : pickerSelected.filter(
                                    (id) => !assignable.some((m) => m.id === id),
                                  ),
                            )
                          }
                        />
                      </th>
                      <th className="px-4 py-3 font-semibold">Meter no.</th>
                      <th className="px-4 py-3 font-semibold">Serial</th>
                      <th className="px-4 py-3 font-semibold">Type</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {assignable.map((m) => (
                      <tr key={m.id} className="hover:bg-accent/5">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            aria-label={`Select meter ${m.meter_number}`}
                            checked={pickerSelected.includes(m.id)}
                            disabled={!!conflictOf(m)}
                            onChange={(e) =>
                              setPickerSelected((prev) =>
                                e.target.checked
                                  ? [...prev, m.id]
                                  : prev.filter((id) => id !== m.id),
                              )
                            }
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">{m.meter_number}</td>
                        <td className="px-4 py-3 text-muted-foreground">{m.serial_number}</td>
                        <td className="px-4 py-3 capitalize text-muted-foreground">{m.type}</td>
                        <td className="px-4 py-3 capitalize text-muted-foreground">
                          {m.status}
                          {conflictOf(m) && (
                            <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-destructive">
                              {conflictOf(m)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <footer className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
              <span className="text-xs text-muted-foreground">{pickerSelected.length} selected</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDialogOpen(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    pickerSelected.length === 0 ||
                    blockedSelection.length > 0 ||
                    assignMutation.isPending
                  }
                  onClick={() => assignMutation.mutate()}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {assignMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                  Register {pickerSelected.length > 0 ? pickerSelected.length : ""} meter
                  {pickerSelected.length === 1 ? "" : "s"}
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}
      {results && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={results.title}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
        >
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <header className="flex items-center justify-between border-b border-border px-6 py-4">
              <h4 className="text-base font-bold text-foreground">{results.title}</h4>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setResults(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent/10 hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </header>
            <ul className="flex-1 divide-y divide-border overflow-y-auto">
              {results.rows.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 px-6 py-3 text-sm">
                  <span className="font-medium text-foreground">{r.meter_number}</span>
                  <span
                    className={
                      r.ok
                        ? "text-xs font-semibold text-emerald-600"
                        : "text-right text-xs text-destructive"
                    }
                  >
                    {r.ok ? "Success" : (r.reason ?? "Skipped")}
                  </span>
                </li>
              ))}
            </ul>
            <footer className="border-t border-border px-6 py-4 text-right">
              <button
                type="button"
                onClick={() => setResults(null)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                Done
              </button>
            </footer>
          </div>
        </div>
      )}

      <AssignmentHistorySection kind={kind} ownerId={ownerId} />

    </section>
  );
}
