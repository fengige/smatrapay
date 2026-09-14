import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
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
  downloadCsv,
  formatDate,
  titleCase,
  useVendorScope,
} from "@/components/vendor/VendorUI";
import { VendorModal } from "@/components/vendor/VendorModal";
import { uploadEvidence } from "@/components/vendor/evidence";
import {
  ISSUE_TYPES,
  PRIORITIES,
  REQUEST_STATUSES,
  createServiceRequest,
  listServiceRequests,
} from "@/lib/vendor-ops.functions";

const PAGE_SIZE = 10;

export const Route = createFileRoute("/_authenticated/vendor/service-requests/")({
  head: () => ({
    meta: [
      { title: "Service Requests · Vendor · SmatraPay" },
      { name: "description", content: "Log and track maintenance and service requests for your meters." },
      { property: "og:title", content: "Service Requests · Vendor · SmatraPay" },
      { property: "og:description", content: "Maintenance requests, technician assignment and resolution tracking." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: ServiceRequests,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{error.message}</p>,
});

function ServiceRequests() {
  const access = Route.useLoaderData();
  const queryClient = useQueryClient();
  const scope = useVendorScope();
  const fetchRequests = useServerFn(listServiceRequests);
  const create = useServerFn(createServiceRequest);

  const requestsQuery = useQuery({
    queryKey: ["vendor-service-requests"],
    queryFn: () => fetchRequests(),
  });

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [issue, setIssue] = useState("all");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const [meterId, setMeterId] = useState("");
  const [issueType, setIssueType] = useState<(typeof ISSUE_TYPES)[number]>(ISSUE_TYPES[0]);
  const [newPriority, setNewPriority] = useState<(typeof PRIORITIES)[number]>("medium");
  const [description, setDescription] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const meters = scope.data?.meters ?? [];
  const meterById = useMemo(() => new Map(meters.map((m) => [m.id, m])), [meters]);
  const rows = requestsQuery.data?.requests ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (priority !== "all" && r.priority !== priority) return false;
      if (issue !== "all" && r.issue_type !== issue) return false;
      if (!q) return true;
      const m = r.meter_id ? meterById.get(r.meter_id) : undefined;
      return [r.request_number, m?.meter_number ?? "", m?.resident_name ?? "", r.technician_name ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [rows, search, status, priority, issue, meterById]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selectedMeter = meterId ? meterById.get(meterId) : undefined;

  const mutation = useMutation({
    mutationFn: async () => {
      let path: string | undefined;
      if (file) {
        setUploading(true);
        try {
          path = await uploadEvidence(file, "service-requests");
        } finally {
          setUploading(false);
        }
      }
      return create({
        data: {
          meter_id: meterId,
          resident_id: selectedMeter?.resident_id ?? null,
          zone_id: selectedMeter?.zone_id ?? null,
          issue_type: issueType,
          priority: newPriority,
          description: description.trim() || undefined,
          preferred_date: preferredDate || null,
          ...(path ? { attachment_paths: [path] } : {}),
        },
      });
    },
    onSuccess: async (res) => {
      setCreating(false);
      setMeterId("");
      setDescription("");
      setPreferredDate("");
      setFile(null);
      await queryClient.invalidateQueries({ queryKey: ["vendor-service-requests"] });
      toast.success(`Request ${res.request_number} created`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DashboardShell
      access={access}
      title="Maintenance / Service Requests"
      description="Faults and service work for meters on your vendor account."
      actions={
        <div className="flex gap-2">
          <button
            className="btn-outline px-3 py-1.5 text-sm"
            onClick={() =>
              downloadCsv(
                "vendor-service-requests.csv",
                ["Request", "Meter", "Resident", "Zone", "Issue", "Priority", "Status", "Technician", "Created"],
                filtered.map((r) => {
                  const m = r.meter_id ? meterById.get(r.meter_id) : undefined;
                  return [
                    r.request_number,
                    m?.meter_number ?? "",
                    m?.resident_name ?? "",
                    m?.zone_name ?? "",
                    r.issue_type,
                    r.priority,
                    r.status,
                    r.technician_name ?? "",
                    r.created_at,
                  ];
                }),
              )
            }
          >
            Export CSV
          </button>
          <button className="btn-primary px-3 py-1.5 text-sm" onClick={() => setCreating(true)}>
            New request
          </button>
        </div>
      }
    >
      {scope.error || requestsQuery.error ? (
        <ErrorBlock message={((scope.error ?? requestsQuery.error) as Error).message} />
      ) : scope.isLoading || requestsQuery.isLoading ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-4 pb-8">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total requests" value={rows.length} />
            <StatCard
              label="Open"
              value={rows.filter((r) => !["closed", "cancelled", "resolved"].includes(r.status)).length}
            />
            <StatCard label="Resolved" value={rows.filter((r) => r.status === "resolved").length} />
            <StatCard
              label="Critical"
              value={rows.filter((r) => r.priority === "critical" && r.status !== "closed").length}
            />
          </div>

          <div className="grid gap-2 rounded-2xl border border-border bg-card p-3 md:grid-cols-4">
            <input
              className="input"
              placeholder="Search request, meter, resident"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              aria-label="Search requests"
            />
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="all">Any status</option>
              {REQUEST_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {titleCase(s)}
                </option>
              ))}
            </select>
            <select
              className="input"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              aria-label="Priority"
            >
              <option value="all">Any priority</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {titleCase(p)}
                </option>
              ))}
            </select>
            <select className="input" value={issue} onChange={(e) => setIssue(e.target.value)} aria-label="Issue type">
              <option value="all">Any issue type</option>
              {ISSUE_TYPES.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </div>

          {current.length === 0 ? (
            <EmptyState title="No service requests" message="No requests match the selected filters." />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full min-w-[62rem] text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Request</th>
                    <th className="px-4 py-3">Meter</th>
                    <th className="px-4 py-3">Resident</th>
                    <th className="px-4 py-3">Zone</th>
                    <th className="px-4 py-3">Issue</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Technician</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Updated</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {current.map((r) => {
                    const m = r.meter_id ? meterById.get(r.meter_id) : undefined;
                    return (
                      <tr key={r.id} className="border-t border-border">
                        <td className="px-4 py-3 font-semibold text-foreground">{r.request_number}</td>
                        <td className="px-4 py-3 text-muted-foreground">{m?.meter_number ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{m?.resident_name ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{m?.zone_name ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.issue_type}</td>
                        <td className="px-4 py-3">
                          <StatusBadge value={r.priority} />
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge value={r.status} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{r.technician_name ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(r.created_at)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(r.updated_at)}</td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            to="/vendor/service-requests/$requestId"
                            params={{ requestId: r.id }}
                            className="btn-outline px-3 py-1 text-xs"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Pagination page={page} pageCount={pageCount} onPage={setPage} total={filtered.length} />
            </div>
          )}
        </div>
      )}

      {creating && (
        <VendorModal title="New service request" onClose={() => setCreating(false)}>
          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase text-muted-foreground">
              Meter
              <select className="input mt-1" value={meterId} onChange={(e) => setMeterId(e.target.value)}>
                <option value="">Select a meter</option>
                {meters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.meter_number} — {m.resident_name ?? "unassigned"} ({m.zone_name ?? "no zone"})
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold uppercase text-muted-foreground">
                Issue type
                <select
                  className="input mt-1"
                  value={issueType}
                  onChange={(e) => setIssueType(e.target.value as (typeof ISSUE_TYPES)[number])}
                >
                  {ISSUE_TYPES.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold uppercase text-muted-foreground">
                Priority
                <select
                  className="input mt-1"
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value as (typeof PRIORITIES)[number])}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {titleCase(p)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-xs font-semibold uppercase text-muted-foreground">
              Description
              <textarea
                className="input mt-1"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="block text-xs font-semibold uppercase text-muted-foreground">
              Preferred date
              <input
                className="input mt-1"
                type="date"
                value={preferredDate}
                onChange={(e) => setPreferredDate(e.target.value)}
              />
            </label>
            <label className="block text-xs font-semibold uppercase text-muted-foreground">
              Attachment (optional)
              <input
                className="input mt-1"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-outline px-3 py-1.5 text-sm" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button
                className="btn-primary px-3 py-1.5 text-sm"
                disabled={!meterId || mutation.isPending || uploading}
                onClick={() => mutation.mutate()}
              >
                {uploading ? "Uploading…" : mutation.isPending ? "Saving…" : "Create request"}
              </button>
            </div>
          </div>
        </VendorModal>
      )}
    </DashboardShell>
  );
}
