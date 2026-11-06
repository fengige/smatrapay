import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { PortalLayout } from "@/components/PortalLayout";
import { BulkMeterAssignment } from "@/components/BulkMeterAssignment";
import {
  bulkAssignMeters,
  bulkUnassignMeters,
  listMeters,
  type MeterRow,
} from "@/lib/meters.functions";
import { installationLabel } from "@/lib/vendor.functions";
import {
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  Pagination,
  StatusBadge,
  formatDate,
  titleCase,
} from "@/components/vendor/VendorUI";

export const Route = createFileRoute("/_authenticated/assignments")({
  head: () => ({
    meta: [
      { title: "Meter Assignments · SmatraPay Admin" },
      {
        name: "description",
        content: "Assign, move or release meters across the units and residents in every zone.",
      },
      { property: "og:title", content: "Meter Assignments · SmatraPay Admin" },
      {
        property: "og:description",
        content: "Keep meter-to-unit assignments accurate across all vendors and properties.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminAssignments,
  errorComponent: ({ error }) => (
    <p className="p-8 text-sm text-destructive">{(error as Error).message}</p>
  ),
});

const PAGE_SIZE = 10;

function ownerLabel(m: MeterRow): string {
  if (m.owner_name) return m.owner_name;
  return "—";
}

function AdminAssignments() {
  const queryClient = useQueryClient();
  const fetchMeters = useServerFn(listMeters);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-assignments"],
    queryFn: () => fetchMeters(),
  });

  const assign = useServerFn(bulkAssignMeters);
  const unassign = useServerFn(bulkUnassignMeters);

  const [q, setQ] = useState("");
  const [state, setState] = useState("all");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<{
    meterId: string;
    meterNumber: string;
    meterType: string;
    unitId: string | null;
  } | null>(null);
  const [targetUnit, setTargetUnit] = useState("");

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin-assignments"] });
  };

  const assignMutation = useMutation({
    mutationFn: (v: { property_id: string; meter_id: string; unit_id: string }) =>
      assign({ data: { property_id: v.property_id, assignments: [{ meter_id: v.meter_id, unit_id: v.unit_id }] } }),
    onSuccess: async (result) => {
      await refresh();
      if (result.assigned > 0) {
        toast.success("Meter assignment saved");
        setDialog(null);
        setTargetUnit("");
      } else {
        toast.error(result.skipped[0]?.reason ?? "Meter could not be assigned");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unassignMutation = useMutation({
    mutationFn: (v: { meter_id: string }) => unassign({ data: { meter_ids: [v.meter_id] } }),
    onSuccess: async () => {
      await refresh();
      toast.success("Meter unassigned");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const meters = useMemo(() => data?.meters ?? [], [data]);
  const units = useMemo(() => data?.units ?? [], [data]);

  /** unit_id:type pairs that already have a meter, so the dialog only offers free slots. */
  const occupied = useMemo(() => {
    const set = new Set<string>();
    for (const m of meters) {
      if (m.unit_id) set.add(`${m.unit_id}:${String(m.type ?? "").toLowerCase()}`);
    }
    return set;
  }, [meters]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return meters.filter((m) => {
      if (state === "assigned" && !m.unit_id) return false;
      if (state === "unassigned" && m.unit_id) return false;
      if (!needle) return true;
      return [m.meter_number, m.owner_name, m.unit_label, m.property_name].some((v) =>
        (v ?? "").toLowerCase().includes(needle),
      );
    });
  }, [meters, q, state]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const targetOptions = useMemo(() => {
    if (!dialog) return [];
    const type = dialog.meterType.toLowerCase();
    return units.filter(
      (u) => u.property_id && (!occupied.has(`${u.id}:${type}`) || u.id === dialog.unitId),
    );
  }, [dialog, units, occupied]);

  const targetPropertyId = targetOptions.find((u) => u.id === targetUnit)?.property_id ?? null;

  return (
    <PortalLayout
      roles={["admin"]}
      title="Meter Assignments"
      description="Meter-to-unit assignments across every vendor, property and zone."
    >
      <div className="mb-4"><BulkMeterAssignment portal="admin" /></div>
      {error ? (
        <ErrorBlock message={(error as Error).message} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : meters.length === 0 ? (
        <EmptyState title="No assignments" message="There are no meters to assign yet." />
      ) : (
        <div className="space-y-4 pb-6">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-w-56 flex-1 items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm">
              <Search className="size-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="Search meter, owner, unit or property"
                aria-label="Search assignments"
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
            </label>
            <select
              aria-label="Filter by assignment state"
              value={state}
              onChange={(e) => {
                setState(e.target.value);
                setPage(1);
              }}
              className="rounded-full border border-border bg-card px-4 py-2 text-sm"
            >
              <option value="all">All meters</option>
              <option value="assigned">Assigned</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Meter</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Owner</th>
                  <th className="px-3 py-2">Unit</th>
                  <th className="px-3 py-2">Property</th>
                  <th className="px-3 py-2">Assignment</th>
                  <th className="px-3 py-2">Installation</th>
                  <th className="px-3 py-2">Added</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {current.map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="px-3 py-2 font-semibold">{m.meter_number}</td>
                    <td className="px-3 py-2">{titleCase(m.type)}</td>
                    <td className="px-3 py-2">
                      {ownerLabel(m)}
                      {m.owner_role && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({titleCase(m.owner_role)})
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{m.unit_label ?? "—"}</td>
                    <td className="px-3 py-2">{m.property_name ?? "—"}</td>
                    <td className="px-3 py-2">
                      <StatusBadge value={m.unit_id ? "assigned" : "unassigned"} />
                    </td>
                    <td className="px-3 py-2">{installationLabel(m.installation_status)}</td>
                    <td className="px-3 py-2">{formatDate(m.created_at)}</td>
                    <td className="px-3 py-2">
                      <span className="flex gap-2 whitespace-nowrap">
                        <Link
                          to="/meters/$meterId"
                          params={{ meterId: m.id }}
                          className="text-xs font-semibold text-primary"
                        >
                          View
                        </Link>
                        <button
                          className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setDialog({
                              meterId: m.id,
                              meterNumber: m.meter_number,
                              meterType: m.type,
                              unitId: m.unit_id,
                            });
                            setTargetUnit(m.unit_id ?? "");
                          }}
                        >
                          {m.unit_id ? "Change" : "Assign"}
                        </button>
                        {m.unit_id && (
                          <button
                            className="text-xs font-semibold text-destructive"
                            disabled={unassignMutation.isPending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Are you sure you want to unassign meter ${m.meter_number}?`,
                                )
                              ) {
                                unassignMutation.mutate({ meter_id: m.id });
                              }
                            }}
                          >
                            Unassign
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
                {current.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                      No meters match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageCount={pageCount} onPage={setPage} total={rows.length} />
        </div>
      )}

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5">
            <h2 className="text-base font-bold text-foreground">
              {dialog.unitId ? "Change meter assignment" : "Assign meter"}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {dialog.unitId
                ? "Are you sure you want to change the unit assigned to this meter? The previous assignment is kept in history."
                : `Choose a unit for meter ${dialog.meterNumber}. Units that already have a ${titleCase(dialog.meterType)} meter are hidden.`}
            </p>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-[0.65rem] font-bold uppercase text-muted-foreground">
                Unit
              </span>
              <select
                className="input"
                value={targetUnit}
                onChange={(e) => setTargetUnit(e.target.value)}
              >
                <option value="">Select a unit</option>
                {targetOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.property_name ?? "Property"} · Unit {u.unit_number}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-outline px-4 py-2 text-sm" onClick={() => setDialog(null)}>
                Cancel
              </button>
              <button
                className="btn-primary px-4 py-2 text-sm"
                disabled={!targetUnit || !targetPropertyId || assignMutation.isPending}
                onClick={() =>
                  targetPropertyId &&
                  assignMutation.mutate({
                    property_id: targetPropertyId,
                    meter_id: dialog.meterId,
                    unit_id: targetUnit,
                  })
                }
              >
                {assignMutation.isPending ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
