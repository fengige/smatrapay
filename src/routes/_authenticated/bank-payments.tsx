import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { PortalLayout } from "@/components/PortalLayout";
import { listNcbaPayments, retryNcbaPayment, runDueNcbaRetries, type NcbaPaymentRow } from "@/lib/ncba.functions";

export const Route = createFileRoute("/_authenticated/bank-payments")({
  head: () => ({
    meta: [
      { title: "Bank Payments | SmatraPay Admin" },
      { name: "description", content: "NCBA Pay Bill payments, failed token generation reasons and retries." },
      { property: "og:title", content: "Bank Payments | SmatraPay Admin" },
      { property: "og:description", content: "Review failed NCBA payments and retry token generation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BankPaymentsRoutePage,
});

const STATUS: Record<string, { label: string; cls: string }> = {
  failed: { label: "Failed", cls: "bg-destructive/10 text-destructive" },
  retry_pending: { label: "Retry queued", cls: "bg-amber-500/15 text-amber-700" },
  needs_review: { label: "Needs review", cls: "bg-orange-500/15 text-orange-700" },
  processing: { label: "Processing", cls: "bg-secondary text-foreground" },
  completed: { label: "Completed", cls: "bg-emerald-500/15 text-emerald-700" },
};

const kes = (n: number) => `KES ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function BankPaymentsRoutePage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"problems" | "all" | "completed">("problems");
  const list = useServerFn(listNcbaPayments);
  const retry = useServerFn(retryNcbaPayment);
  const runDue = useServerFn(runDueNcbaRetries);
  const [confirm, setConfirm] = useState<NcbaPaymentRow | null>(null);

  const { data = [], isLoading, isFetching, refetch, isError } = useQuery({
    queryKey: ["bank-payments", filter],
    queryFn: () => list({ data: { status: filter } }),
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => retry({ data: { id } }),
    onSuccess: (r) => {
      setConfirm(null);
      if (r.status === "completed") toast.success(r.message ?? "Token generated");
      else toast.error(r.message ?? "Retry failed");
      void qc.invalidateQueries({ queryKey: ["bank-payments"] });
    },
    onError: (e: Error) => toast.error(e.message || "Retry failed"),
  });

  const dueMutation = useMutation({
    mutationFn: () => runDue(),
    onSuccess: (r) => {
      toast.success(r.processed ? `Ran ${r.processed} queued retr${r.processed === 1 ? "y" : "ies"} · ${r.completed} completed` : "No queued retries are due");
      void qc.invalidateQueries({ queryKey: ["bank-payments"] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not run queued retries"),
  });

  return (
    <PortalLayout
      roles={["admin"]}
      title="Bank Payments"
      description="Payments received from NCBA and Sidian Bank, why a token failed, and retries"
      actions={
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => dueMutation.mutate()} disabled={dueMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10 disabled:opacity-60">
            {dueMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Run queued retries
          </button>
          <button type="button" onClick={() => refetch()}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10">
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      }
    >
      <div className="mb-4 flex gap-2">
        {([["problems", "Needs attention"], ["completed", "Completed"], ["all", "All"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setFilter(k)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filter === k ? "bg-primary text-primary-foreground" : "border border-border bg-background"}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[60rem] text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Received</th>
                <th className="px-4 py-3">Bank</th>
                <th className="px-4 py-3">TransID</th>
                <th className="px-4 py-3">Meter</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Attempts</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={9} className="px-4 py-10 text-center"><Loader2 className="mx-auto size-5 animate-spin" /></td></tr>
              )}
              {isError && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-destructive">Could not load NCBA payments.</td></tr>
              )}
              {!isLoading && !isError && data.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                  {filter === "problems" ? "No NCBA payments need attention." : "No NCBA payments yet."}
                </td></tr>
              )}
              {data.map((r) => {
                const st = STATUS[r.status] ?? { label: r.status, cls: "bg-secondary" };
                return (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="px-4 py-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 font-semibold">{r.bank ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs">{r.trans_id ?? "—"}</td>
                    <td className="px-4 py-3">{r.meter_number ?? "—"}</td>
                    <td className="px-4 py-3 text-right">{kes(r.trans_amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span>
                      {r.status === "retry_pending" && r.next_retry_at && (
                        <span className="mt-1 block text-xs text-muted-foreground">Next: {new Date(r.next_retry_at).toLocaleTimeString()}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      {r.status === "completed" ? (
                        <span className="text-xs text-muted-foreground">Token {r.token ?? "—"} · SMS: {r.sms_status ?? "—"}</span>
                      ) : (
                        <>
                          <span className="block">{r.error_message ?? "—"}</span>
                          {r.status === "needs_review" && (
                            <span className="mt-1 block text-xs text-muted-foreground">
                              The vending service didn't answer, so a token may already exist. Check with the provider before retrying.
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{r.attempts} total · {r.auto_retry_count} automatic</td>
                    <td className="px-4 py-3 text-right">
                      {r.status !== "completed" && r.status !== "processing" && (
                        <button type="button" onClick={() => setConfirm(r)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
                          <RotateCcw className="size-3.5" /> Retry
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div role="dialog" aria-modal="true" aria-label="Confirm retry" className="w-full max-w-md rounded-2xl border border-border bg-card p-5">
            <h2 className="text-base font-bold">Retry token generation?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {kes(confirm.trans_amount)} for meter {confirm.meter_number ?? confirm.narrative} ({confirm.bank ?? "NCBA"} {confirm.trans_id}). This sends a real token request to the meter's vending software.
            </p>
            {confirm.status === "needs_review" && (
              <p className="mt-2 text-sm font-medium text-destructive">
                The last attempt timed out. Only retry after confirming with the provider that no token was issued.
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirm(null)} disabled={retryMutation.isPending}
                className="rounded-lg border border-border px-3.5 py-2 text-sm">Cancel</button>
              <button type="button" onClick={() => retryMutation.mutate(confirm.id)} disabled={retryMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {retryMutation.isPending && <Loader2 className="size-4 animate-spin" />} Retry now
              </button>
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
