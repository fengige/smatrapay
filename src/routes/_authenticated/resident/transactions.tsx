import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listMyPurchases, retryTokenPurchase } from "@/lib/resident-portal.functions";
import { PURCHASE_LABEL, canRetryVend, type PurchaseStatus } from "@/lib/resident-portal";
import { Badge, Card, Empty, field, kes, residentHead, when } from "@/components/resident/ResidentUI";
import { PurchaseStatusCard } from "./buy-tokens";

export const Route = createFileRoute("/_authenticated/resident/transactions")({
  head: residentHead("My Transactions", "Your token purchases, M-Pesa receipts and token retrieval."),
  loader: () => checkRoleAccess({ data: { role: "resident" } }),
  component: Page,
  errorComponent: () => <p className="p-8 text-sm">Could not load your transactions.</p>,
});

function Page() {
  const access = Route.useLoaderData();
  const listFn = useServerFn(listMyPurchases);
  const retryFn = useServerFn(retryTokenPurchase);
  const qc = useQueryClient();
  const [f, setF] = useState({ q: "", status: "", from: "", to: "" });
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["resident-purchases", f], queryFn: () => listFn({ data: { ...f, status: f.status || undefined, from: f.from || undefined, to: f.to || undefined } }), enabled: access.allowed });
  const retry = useMutation({
    mutationFn: (id: string) => retryFn({ data: { id } }),
    onSuccess: (r) => { (r.status === "vended" ? toast.success : toast.error)(r.status === "vended" ? "Token issued" : r.message ?? "Still not ready"); qc.invalidateQueries({ queryKey: ["resident-purchases"] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <DashboardShell access={access} title="My Transactions" description="Token purchases paid with M-Pesa. Rent and bill payments will appear here once billing is live.">
      <Card>
        <div className="mb-4 grid gap-2 sm:grid-cols-4">
          <input className={field} placeholder="Search meter or M-Pesa receipt" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          <select className={field} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="Status">
            <option value="">All statuses</option>
            {Object.entries(PURCHASE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input type="date" className={field} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} aria-label="From" />
          <input type="date" className={field} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} aria-label="To" />
        </div>
        {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (q.data ?? []).length === 0 ? <Empty>No transactions found.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr><th className="py-2 pr-4">Date</th><th className="pr-4">Type</th><th className="pr-4">Meter</th><th className="pr-4">Method</th><th className="pr-4">M-Pesa receipt</th><th className="pr-4 text-right">Amount</th><th className="pr-4">Status</th><th /></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {q.data!.map((r) => (
                  <tr key={r.id}>
                    <td className="py-3 pr-4">{when(r.created_at)}</td>
                    <td className="pr-4">{r.meter_type} token</td>
                    <td className="pr-4 font-mono">{r.meter_number}</td>
                    <td className="pr-4">M-Pesa</td>
                    <td className="pr-4">{r.mpesa_receipt_number ?? "—"}</td>
                    <td className="pr-4 text-right">{kes(r.amount)}</td>
                    <td className="pr-4"><Badge status={r.status}>{PURCHASE_LABEL[r.status as PurchaseStatus] ?? r.status}</Badge></td>
                    <td className="space-x-2 whitespace-nowrap">
                      <button className="text-primary" onClick={() => setOpen(r.id)}>{r.status === "vended" ? "View token" : "Details"}</button>
                      {canRetryVend(r.status) && <button className="text-primary" disabled={retry.isPending} onClick={() => retry.mutate(r.id)}>Retry token</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Transaction details</DialogTitle></DialogHeader>
          {open && <PurchaseStatusCard id={open} />}
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
