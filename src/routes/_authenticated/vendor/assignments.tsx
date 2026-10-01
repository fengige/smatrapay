import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { assignVendorMeter, listVendorUnits, unassignVendorMeter } from "@/lib/vendor.functions";
import {
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  Pagination,
  StatusBadge,
  formatDate,
  installationLabel,
  titleCase,
  useVendorScope,
} from "@/components/vendor/VendorUI";

export const Route = createFileRoute("/_authenticated/vendor/assignments")({
  head: () => ({
    meta: [
      { title: "Meter Assignments · Vendor · SmatraPay" },
      {
        name: "description",
        content: "Assign, move or release meters across the units and residents in your zones.",
      },
      { property: "og:title", content: "Meter Assignments · Vendor · SmatraPay" },
      {
        property: "og:description",
        content: "Keep meter-to-resident assignments accurate across your zones.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorAssignments,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{(error as Error).message}</p>,
});

const PAGE_SIZE = 10;

function VendorAssignments() {
  const access = Route.useLoaderData();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useVendorScope();
  const fetchUnits = useServerFn(listVendorUnits);
  const { data: unitData } = useQuery({ queryKey: ["vendor-units"], queryFn: () => fetchUnits() });

  const assign = useServerFn(assignVendorMeter);
  const unassign = useServerFn(unassignVendorMeter);

  const [q, setQ] = useState("");
  const [state, setState] = useState("all");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<{ meterId: string; meterNumber: string; unitId: string | null } | null>(
    null,
  );
  const [targetUnit, setTargetUnit] = useState("");
  const [reason, setReason] = useState("");

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["vendor-scope"] });
    await queryClient.invalidateQueries({ queryKey: ["vendor-units"] });
  };

  const assignMutation = useMutation({
    mutationFn: (v: { meter_id: string; unit_id: string; reason?: string }) => assign({ data: v }),
    onSuccess: async () => {
      await refresh();
      toast.success("Meter assignment saved");
      setDialog(null);
      setTargetUnit("");
      setReason("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unassignMutation = useMutation({
    mutationFn: (v: { meter_id: string }) => unassign({ data: v }),
    onSuccess: async () => {
      await refresh();
      toast.success("Meter unassigned");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const meters = data?.meters ?? [];
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return meters.filter((m) => {
      if (state === "assigned" && !m.unit_id) return false;
      if (state === "unassigned" && m.unit_id) return false;
      if (!needle) return true;
      return [m.meter_number, m.resident_name, m.zone_name, m.unit_label].some((v) =>
        (v ?? "").toLowerCase().includes(needle),
      );
    });
  }, [meters, q, state]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <DashboardShell
      access={access}
      title="Meter assignments"
      description="Meter-to-unit and meter-to-resident assignments inside your zones."
    >
      {error ? (
        <ErrorBlock message={(error as Error).message} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : meters.length === 0 ? (
        <EmptyState title="No assignments" message="You have no meters to assign yet." />
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
                placeholder="Search meter, resident or zone"
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
                  <th className="px-3 py-2">Resident</th>
                  <th className="px-3 py-2">Unit</th>
                  <th className="px-3 py-2">Zone</th>
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
                    <td className="px-3 py-2">{m.resident_name ?? "—"}</td>
                    <td className="px-3 py-2">{m.unit_label ?? "—"}</td>
                    <td className="px-3 py-2">{m.zone_name ?? "—"}</td>
                    <td className="px-3 py-2">
                      <StatusBadge value={m.unit_id ? "assigned" : "unassigned"} />
                    </td>
                    <td className="px-3 py-2">{installationLabel(m.installation_status)}</td>
                    <td className="px-3 py-2">{formatDate(m.created_at)}</td>
                    <td className="px-3 py-2">
                      <span className="flex gap-2 whitespace-nowrap">
                        <Link
                          to="/vendor/meters/$meterId"
                          params={{ meterId: m.id }}
                          className="text-xs font-semibold text-primary"
                        >
                          View
                        </Link>
                        <button
                          className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setDialog({ meterId: m.id, meterNumber: m.meter_number, unitId: m.unit_id });
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
                ? "Are you sure you want to change the resident assigned to this meter? The previous assignment is kept in history."
                : `Choose a unit inside your zones for meter ${dialog.meterNumber}.`}
            </p>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-[0.65rem] font-bold uppercase text-muted-foreground">
                Unit
              </span>
              <select className="input" value={targetUnit} onChange={(e) => setTargetUnit(e.target.value)}>
                <option value="">Select a unit</option>
                {(unitData?.units ?? [])
                  .filter((u) => !u.meter_number || u.id === dialog.unitId)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.zone_name ?? "Zone"} · {u.property_name ?? "Property"} · {u.unit_label}
                      {u.resident_name ? ` · ${u.resident_name}` : " · vacant"}
                    </option>
                  ))}
              </select>
            </label>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-[0.65rem] font-bold uppercase text-muted-foreground">
                Reason (optional)
              </span>
              <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-outline px-4 py-2 text-sm" onClick={() => setDialog(null)}>
                Cancel
              </button>
              <button
                className="btn-primary px-4 py-2 text-sm"
                disabled={!targetUnit || assignMutation.isPending}
                onClick={() =>
                  assignMutation.mutate({
                    meter_id: dialog.meterId,
                    unit_id: targetUnit,
                    ...(reason ? { reason } : {}),
                  })
                }
              >
                {assignMutation.isPending ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
