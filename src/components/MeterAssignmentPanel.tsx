import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Gauge, Loader2, Plus, Search, Unlink, X } from "lucide-react";
import { toast } from "sonner";

import {
  assignMetersToAgent,
  listAgentMeters,
  listAssignableAgentMeters,
  unassignMetersFromAgent,
} from "@/lib/agents.functions";
import {
  assignMetersToVendor,
  listAssignableVendorMeters,
  listVendorMeters,
  unassignMetersFromVendor,
} from "@/lib/vendors.functions";

type Kind = "agent" | "vendor";

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
    queryFn: () => (listOwned as (o: { data: unknown }) => Promise<{ meters: OwnedMeter[] }>)({
      data: ownerArg(),
    }),
  });

  const meters = data?.meters ?? [];

  const [selected, setSelected] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmUnassign, setConfirmUnassign] = useState(false);
  const [search, setSearch] = useState("");
  const [pickerSelected, setPickerSelected] = useState<string[]>([]);

  useEffect(() => {
    if (!dialogOpen) {
      setSearch("");
      setPickerSelected([]);
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
      (listAssignable as (o: { data: unknown }) => Promise<{ meters: OwnedMeter[] }>)({
        data: {} as never,
      }),
    enabled: dialogOpen,
  });

  const assignable = useMemo(() => {
    const all = assignableData?.meters ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (m) =>
        m.meter_number.toLowerCase().includes(q) ||
        (m.serial_number ?? "").toLowerCase().includes(q),
    );
  }, [assignableData, search]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ownedKey });
    queryClient.invalidateQueries({ queryKey: [`assignable-${kind}-meters`] });
  };

  const assignMutation = useMutation({
    mutationFn: () =>
      (assign as (o: { data: unknown }) => Promise<{ assigned: number; skipped: string[] }>)({
        data: ownerArg({ meterIds: pickerSelected }),
      }),
    onSuccess: (res) => {
      toast.success(
        `${res.assigned} meter${res.assigned === 1 ? "" : "s"} registered to ${ownerName}`,
        res.skipped.length > 0
          ? { description: `Skipped (already registered): ${res.skipped.join(", ")}` }
          : undefined,
      );
      refresh();
      setDialogOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unassignMutation = useMutation({
    mutationFn: () =>
      (unassign as (o: { data: unknown }) => Promise<{ unassigned: number }>)({
        data: ownerArg({ meterIds: selected }),
      }),
    onSuccess: (res) => {
      toast.success(`${res.unassigned} meter${res.unassigned === 1 ? "" : "s"} unassigned`);
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
                                    new Set([...pickerSelected, ...assignable.map((m) => m.id)]),
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
                        <td className="px-4 py-3 capitalize text-muted-foreground">{m.status}</td>
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
                  disabled={pickerSelected.length === 0 || assignMutation.isPending}
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
    </section>
  );
}
