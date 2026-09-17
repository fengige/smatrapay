import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Eye,
  Gauge,
  Loader2,
  Pencil,
  Plus,
  PowerOff,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { PortalLayout } from "@/components/PortalLayout";
import { VendingSoftwareDialog } from "@/components/VendingSoftwareDialog";
import {
  archiveVendingSoftware,
  listVendingSoftware,
  setVendingSoftwareStatus,
  type VendingSoftwareRow,
} from "@/lib/vending-software.functions";

export const Route = createFileRoute("/_authenticated/vending-software/")({
  head: () => ({
    meta: [
      { title: "Vending Software · SmatraPay" },
      {
        name: "description",
        content:
          "Manage the vending software platforms used by prepaid meters: versions, status and how many meters use each one.",
      },
      { property: "og:title", content: "Vending Software · SmatraPay" },
      {
        property: "og:description",
        content: "Register, activate and review vending software used across your meter estate.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VendingSoftwarePage,
  errorComponent: ({ error }) => <div className="p-10 text-sm text-destructive">{error.message}</div>,
});

export const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-500/12 text-emerald-600",
  inactive: "bg-muted text-muted-foreground",
  archived: "bg-destructive/10 text-destructive",
};

const PAGE_SIZE_OPTIONS = [10, 25, 50];

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";

function VendingSoftwarePage() {
  const queryClient = useQueryClient();
  const fetchList = useServerFn(listVendingSoftware);
  const changeStatus = useServerFn(setVendingSoftwareStatus);
  const archive = useServerFn(archiveVendingSoftware);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [meterFilter, setMeterFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<VendingSoftwareRow | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["vending-software"],
    queryFn: () => fetchList(),
  });

  const software = data?.software ?? [];
  const stats = data?.stats;

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["vending-software"] });
    await queryClient.invalidateQueries({ queryKey: ["meters"] });
  };

  const statusMutation = useMutation({
    mutationFn: (vars: { id: string; status: "active" | "inactive" }) => changeStatus({ data: vars } as never),
    onSuccess: async (_r, vars) => {
      await invalidate();
      toast.success(vars.status === "active" ? "Vending software activated" : "Vending software deactivated");
    },
    onError: (e: Error) => toast.error(e.message || "Could not update vending software"),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archive({ data: { id } } as never),
    onSuccess: async () => {
      await invalidate();
      toast.success("Vending software archived");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return software.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (meterFilter === "with" && s.meter_count === 0) return false;
      if (meterFilter === "without" && s.meter_count > 0) return false;
      if (fromDate && new Date(s.created_at) < new Date(fromDate)) return false;
      if (!needle) return true;
      return [s.name, s.code ?? "", s.version ?? "", s.description ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [software, q, statusFilter, meterFilter, fromDate]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pageCount);
  const paged = rows.slice((current - 1) * pageSize, current * pageSize);

  const confirmStatus = (s: VendingSoftwareRow) => {
    const next = s.status === "active" ? "inactive" : "active";
    const msg =
      next === "inactive"
        ? `Deactivate ${s.name}? ${s.meter_count} meter${s.meter_count === 1 ? "" : "s"} currently use it and will keep their assignment.`
        : `Activate ${s.name}? It will become selectable for new meter assignments.`;
    if (!window.confirm(msg)) return;
    statusMutation.mutate({ id: s.id, status: next });
  };

  const confirmArchive = (s: VendingSoftwareRow) => {
    if (s.meter_count > 0) {
      toast.error(
        "This vending software is currently assigned to meters and cannot be permanently deleted. Deactivate it instead.",
      );
      return;
    }
    if (!window.confirm(`Archive ${s.name}? It will no longer be available for new meters.`)) return;
    archiveMutation.mutate(s.id);
  };

  const cards = [
    { label: "Total vending software", value: stats?.total ?? 0, icon: Cpu, tone: "text-primary" },
    { label: "Active", value: stats?.active ?? 0, icon: CheckCircle2, tone: "text-emerald-600" },
    { label: "Inactive", value: stats?.inactive ?? 0, icon: PowerOff, tone: "text-muted-foreground" },
    { label: "Meters using software", value: stats?.assignedMeters ?? 0, icon: Gauge, tone: "text-primary" },
    { label: "Unassigned meters", value: stats?.unassignedMeters ?? 0, icon: Gauge, tone: "text-amber-600" },
  ];

  return (
    <PortalLayout
      roles={["admin"]}
      title="Vending Software"
      description="Vending platforms available when registering prepaid meters"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="size-4" /> Add Vending Software
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            aria-label="Refresh vending software"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10"
          >
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">{c.label}</span>
              <c.icon className={`size-4 ${c.tone}`} />
            </div>
            <div className="mt-2 text-2xl font-bold">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search vending software..."
            aria-label="Search vending software"
            className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
          className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="archived">Archived</option>
        </select>
        <select
          value={meterFilter}
          onChange={(e) => {
            setMeterFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by meters"
          className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
        >
          <option value="all">Any number of meters</option>
          <option value="with">With meters</option>
          <option value="without">Without meters</option>
        </select>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => {
            setFromDate(e.target.value);
            setPage(1);
          }}
          aria-label="Added on or after"
          className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
        />
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Software</th>
              <th className="px-4 py-3 text-left">Code</th>
              <th className="px-4 py-3 text-left">Version</th>
              <th className="px-4 py-3 text-left">Description</th>
              <th className="px-4 py-3 text-left">Meters</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Date added</th>
              <th className="px-4 py-3 text-left">Last updated</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto size-5 animate-spin" />
                </td>
              </tr>
            )}
            {!isLoading && !software.length && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                  <p>No vending software has been configured yet.</p>
                  <button
                    type="button"
                    onClick={() => setShowAdd(true)}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                  >
                    <Plus className="size-4" /> Add Vending Software
                  </button>
                </td>
              </tr>
            )}
            {!isLoading && software.length > 0 && !paged.length && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                  No vending software matches your filters.
                </td>
              </tr>
            )}
            {paged.map((s) => (
              <tr key={s.id} className="border-t border-border/70">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {s.logo_url ? (
                      <img src={s.logo_url} alt="" className="size-8 rounded-lg object-cover" />
                    ) : (
                      <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                        {s.name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <span className="font-medium text-foreground">{s.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3">{s.code ?? "—"}</td>
                <td className="px-4 py-3">{s.version ?? "—"}</td>
                <td className="max-w-[240px] truncate px-4 py-3 text-muted-foreground">
                  {s.description ?? "—"}
                </td>
                <td className="px-4 py-3">{s.meter_count.toLocaleString()}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${STATUS_TONE[s.status] ?? ""}`}>
                    {s.status}
                  </span>
                </td>
                <td className="px-4 py-3">{fmtDate(s.created_at)}</td>
                <td className="px-4 py-3">{fmtDate(s.updated_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <Link
                      to="/vending-software/$softwareId"
                      params={{ softwareId: s.id }}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent/10"
                    >
                      <Eye className="size-3.5" /> View
                    </Link>
                    <button
                      type="button"
                      onClick={() => setEditing(s)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent/10"
                    >
                      <Pencil className="size-3.5" /> Edit
                    </button>
                    <button
                      type="button"
                      disabled={statusMutation.isPending || s.status === "archived"}
                      onClick={() => confirmStatus(s)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent/10 disabled:opacity-60"
                    >
                      {s.status === "active" ? (
                        <>
                          <PowerOff className="size-3.5" /> Deactivate
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="size-3.5" /> Activate
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={archiveMutation.isPending || s.status === "archived"}
                      onClick={() => confirmArchive(s)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
                    >
                      <Trash2 className="size-3.5" /> Archive
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{rows.length} record(s)</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              aria-label="Rows per page"
              className="h-9 rounded-lg border border-border bg-background px-2 text-xs"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} per page
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={current <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent/10 disabled:opacity-50"
            >
              <ChevronLeft className="size-3.5" /> Previous
            </button>
            <span className="text-xs text-muted-foreground">
              Page {current} of {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={current >= pageCount}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent/10 disabled:opacity-50"
            >
              Next <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        Only active vending software can be selected for new meter assignments. Deactivating software never
        detaches meters that already use it.
      </p>

      {(showAdd || editing) && (
        <VendingSoftwareDialog
          software={editing}
          onClose={() => {
            setShowAdd(false);
            setEditing(null);
          }}
          onSaved={async () => {
            const wasEdit = Boolean(editing);
            setShowAdd(false);
            setEditing(null);
            await invalidate();
            toast.success(wasEdit ? "Vending software updated" : "Vending software added");
          }}
        />
      )}
    </PortalLayout>
  );
}
