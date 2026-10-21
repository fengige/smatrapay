import { Link } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  assignJobToProvider,
  listAssignableProviders,
  listJobs,
  listMyJobs,
  listCustomerJobs,
  getCustomerJobUpdates,
  getJobUpdates,
  updateMyJobStatus,
  PROVIDER_TRANSITIONS,
  type JobRow,
} from "@/lib/jobs.functions";

const STATUSES = ["open", "assigned", "in_progress", "resolved", "closed", "cancelled"] as const;
type Status = (typeof STATUSES)[number];
const FINISHED = ["resolved", "closed", "cancelled"];
const input =
  "h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

const label = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const date = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-KE") : "—");

export function JobsView({ mode, residentId }: { mode: "admin" | "vendor" | "provider" | "customer"; residentId?: string }) {
  const fetchJobs = useServerFn(listJobs);
  const fetchMine = useServerFn(listMyJobs);
  const fetchCustomer = useServerFn(listCustomerJobs);
  const fetchUpdates = useServerFn(getCustomerJobUpdates);
  const fetchStaffUpdates = useServerFn(getJobUpdates);
  const fetchProviders = useServerFn(listAssignableProviders);
  const assign = useServerFn(assignJobToProvider);
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status | "">("");
  const [provider, setProvider] = useState("");
  const [unassigned, setUnassigned] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<JobRow | null>(null);
  const [pick, setPick] = useState("");
  const [detail, setDetail] = useState<JobRow | null>(null);
  const canAssign = mode === "admin" || mode === "vendor";
  const canViewDetails = mode !== "provider";
  const updates = useQuery({
    queryKey: ["job-updates", mode, detail?.id],
    queryFn: () => {
      if (!detail) throw new Error("Select a job");
      return mode === "customer"
        ? fetchUpdates({ data: { id: detail.id } })
        : fetchStaffUpdates({ data: { id: detail.id } });
    },
    enabled: canViewDetails && !!detail,
  });
  const limit = 20;

  const filters = {
    q: q || undefined,
    status: status || undefined,
    from: from || undefined,
    to: to || undefined,
    page,
    limit,
  };
  const jobs = useQuery({
    queryKey: ["jobs", mode, residentId, filters, provider, unassigned],
    queryFn: () =>
      mode === "customer"
        ? fetchCustomer({ data: filters })
        : mode === "provider"
        ? fetchMine({ data: filters })
        : fetchJobs({
            data: { ...filters, provider: provider || undefined, unassigned: unassigned || undefined, resident: residentId },
          }),
    placeholderData: keepPreviousData,
  });
  const providers = useQuery({
    queryKey: ["assignable-providers"],
    queryFn: () => fetchProviders(),
    enabled: canAssign,
  });

  const setStatus_ = useServerFn(updateMyJobStatus);
  const statusMut = useMutation({
    mutationFn: (v: { id: string; status: "in_progress" | "resolved" | "cancelled" }) =>
      setStatus_({ data: v }),
    onSuccess: (result) => {
      toast.success("Job updated");
      if (result.sms.status === "submitted") toast.success(result.sms.message);
      else toast.warning(`Job saved, but SMS failed: ${result.sms.message}`);
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const ACTION_LABEL = { in_progress: "Start (In Progress)", resolved: "Completed", cancelled: "Cancel" } as const;

  const assignMut = useMutation({
    mutationFn: (v: { id: string; provider_id: string }) => assign({ data: v }),
    onSuccess: () => {
      toast.success("Job assigned");
      setTarget(null);
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = jobs.data?.rows ?? [];
  const total = jobs.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / limit));
  const reset = () => setPage(1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <label className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <input
            className={`${input} w-full pl-9`}
            placeholder="Search job number, issue or description"
            value={q}
            onChange={(e) => (setQ(e.target.value), reset())}
          />
        </label>
        <select className={input} value={status} onChange={(e) => (setStatus(e.target.value as Status), reset())}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{label(s)}</option>
          ))}
        </select>
        {canAssign && (
          <>
            <select className={input} value={provider} onChange={(e) => (setProvider(e.target.value), reset())}>
              <option value="">All service providers</option>
              {(providers.data?.providers ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <label className="flex h-10 items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={unassigned} onChange={(e) => (setUnassigned(e.target.checked), reset())} />
              Unassigned only
            </label>
          </>
        )}
        <input type="date" className={input} value={from} onChange={(e) => (setFrom(e.target.value), reset())} aria-label="From date" />
        <input type="date" className={input} value={to} onChange={(e) => (setTo(e.target.value), reset())} aria-label="To date" />
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Job ID</th>
              <th className="px-4 py-3">Issue</th>
              {!residentId && <th className="px-4 py-3">Resident</th>}
              <th className="px-4 py-3">Property / Unit</th>
              <th className="px-4 py-3">Meter</th>
              {mode === "admin" && <th className="px-4 py-3">Vendor</th>}
              {mode !== "provider" && <th className="px-4 py-3">Service Provider</th>}
              <th className="px-4 py-3">Requested</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.isLoading ? (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">Loading jobs…</td></tr>
            ) : jobs.error ? (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-destructive">{(jobs.error as Error).message}</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">{residentId ? "No service requests for this resident yet." : "No jobs match these filters."}</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-3 font-mono text-xs">
                    {mode === "vendor" ? (
                      <Link to="/vendor/service-requests/$requestId" params={{ requestId: r.id }} className="text-primary hover:underline">
                        {r.request_number}
                      </Link>
                    ) : (
                      r.request_number
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{r.issue_type}</div>
                    {r.description && <div className="line-clamp-1 text-xs text-muted-foreground">{r.description}</div>}
                  </td>
                  {!residentId && <td className="px-4 py-3">{r.resident_name ?? "—"}</td>}
                  <td className="px-4 py-3">{[r.property_name, r.unit_number].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.meter_number ?? "—"}</td>
                  {mode === "admin" && <td className="px-4 py-3">{r.vendor_name ?? "—"}</td>}
                   {mode !== "provider" && (
                    <td className="px-4 py-3">
                      {r.provider_name ? (
                        mode === "admin" && r.provider_id ? (
                          <Link to="/service-providers/$id" params={{ id: r.provider_id }} className="text-primary hover:underline">
                            {r.provider_name}
                          </Link>
                        ) : (
                          r.provider_name
                        )
                      ) : (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3">{date(r.created_at)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">{r.status === "resolved" ? "Completed" : label(r.status)}</span>
                  </td>
                  {mode === "provider" && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {(PROVIDER_TRANSITIONS[r.status] ?? []).map((st) => (
                          <Button
                            key={st}
                            size="sm"
                            variant={st === "cancelled" ? "outline" : "default"}
                            disabled={statusMut.isPending}
                            onClick={() => {
                              if (st === "cancelled" && !window.confirm(`Cancel ${r.request_number}?`)) return;
                              statusMut.mutate({ id: r.id, status: st as "in_progress" | "resolved" | "cancelled" });
                            }}
                          >
                            {ACTION_LABEL[st as keyof typeof ACTION_LABEL]}
                          </Button>
                        ))}
                      </div>
                    </td>
                  )}
                  {canAssign && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setDetail(r)}>View</Button>
                        {!FINISHED.includes(r.status) && (
                          <Button size="sm" variant="outline" onClick={() => (setTarget(r), setPick(r.provider_id ?? ""))}>
                            <UserPlus className="mr-1 h-4 w-4" />
                            {r.provider_name ? "Reassign" : "Assign"}
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                  {mode === "customer" && <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => setDetail(r)}>View updates</Button>
                  </td>}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{total} job{total === 1 ? "" : "s"}</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span>Page {page} of {pages}</span>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      </div>

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>{detail?.request_number}</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <p className="font-medium">{detail?.issue_type}</p>
            <p>{detail?.description || "—"}</p>
            <p>Provider: {detail?.provider_name || "Unassigned"}</p>
            <p>Status: {detail?.status === "resolved" ? "Completed" : label(detail?.status || "open")}</p>
            <p>Scheduled: {date(detail?.preferred_date ?? null)}</p>
            <p>Completed: {date(detail?.completed_at ?? null)}</p>
          </div>
          <h3 className="font-medium">{mode === "customer" ? "Provider updates" : "Job activity"}</h3>
          {updates.isPending ? <p className="text-sm text-muted-foreground">Loading updates…</p>
            : updates.error ? <p className="text-sm text-destructive">{updates.error.message}</p>
            : !updates.data?.updates.length ? <p className="text-sm text-muted-foreground">No updates yet.</p>
            : <ol className="space-y-3">{updates.data.updates.map((u: { id: string; assigned: boolean; status: string | null; created_at: string; note: string | null }) => <li key={u.id} className="border-l-2 border-border pl-3 text-sm">
              <p className="font-medium">{u.assigned ? "Service provider assigned" : u.status === "resolved" ? "Completed" : label(u.status || "Updated")}</p>
              <p className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleString("en-KE")}</p>
              {u.note && <p className="mt-1 whitespace-pre-wrap break-words">{u.note}</p>}
            </li>)}</ol>}
        </DialogContent>
      </Dialog>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign {target?.request_number} — {target?.issue_type}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Only active service providers are listed.</p>
          <select className={`${input} w-full`} value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Select a service provider…</option>
            {(providers.data?.providers ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.business_name ? ` (${p.business_name})` : ""}
                {p.services.length ? ` — ${p.services.join(", ")}` : ""}
              </option>
            ))}
          </select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button>
            <Button
              disabled={!pick || assignMut.isPending}
              onClick={() => target && assignMut.mutate({ id: target.id, provider_id: pick })}
            >
              {assignMut.isPending ? "Assigning…" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
