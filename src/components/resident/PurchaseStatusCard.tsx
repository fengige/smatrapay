import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { getTokenPurchase } from "@/lib/resident-portal.functions";
import { PURCHASE_LABEL, type PurchaseStatus } from "@/lib/resident-portal";
import { Badge, Card, kes } from "@/components/resident/ResidentUI";
import { Button } from "@/components/ui/button";
export function PurchaseStatusCard({ id, onNew }: { id: string; onNew?: () => void }) {
  const getFn = useServerFn(getTokenPurchase);
  const q = useQuery({
    queryKey: ["resident-purchase", id],
    queryFn: () => getFn({ data: { id } }),
    refetchInterval: (query) => (["initiated", "pending_payment", "paid", "vending"].includes(query.state.data?.status ?? "initiated") ? 4000 : false),
  });
  const p = q.data;
  if (q.error) return <div role="alert"><p className="text-sm text-destructive">Could not refresh this purchase. Do not pay again until its status is confirmed.</p><Button variant="outline" onClick={() => void q.refetch()}>Check status again</Button></div>;
  if (!p) return <p role="status" className="text-sm text-muted-foreground">Loading purchase…</p>;
  const tok = p.token?.token as string | undefined;
  return (
    <Card title="Purchase status" action={<Badge status={p.status}>{PURCHASE_LABEL[p.status as PurchaseStatus] ?? p.status}</Badge>}>
      <p className="text-sm text-muted-foreground">{kes(p.amount)} for meter <span className="font-mono">{p.meter_number}</span> · M-Pesa {p.phone}</p>
      {p.status === "pending_payment" && <p className="mt-4 text-sm">Check your phone and enter your M-Pesa PIN. This page updates automatically.</p>}
      {p.status === "payment_failed" && <p className="mt-4 text-sm text-destructive">{p.error ?? "The payment was not completed."} You have not been charged.</p>}
      {p.status === "vend_failed" && <p className="mt-4 text-sm">Your payment {p.receipt ? `(${p.receipt}) ` : ""}was received, but the token isn't ready yet. Open <Link to="/resident/transactions" className="text-primary">My Token Purchases</Link> to retry — you won't be charged again.</p>}
      {tok && p.status === "vended" && (
        <div className="mt-4 rounded-xl bg-muted p-4">
          <p className="text-xs text-muted-foreground">Your token · receipt {p.receipt ?? "—"}</p>
          <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <p className="min-w-0 break-all font-mono text-xl font-bold text-foreground">{tok}</p>
            <Button variant="outline" size="icon" className="size-11" aria-label="Copy token" onClick={async () => { try { await navigator.clipboard.writeText(tok.replace(/\D/g, "")); toast.success("Token copied"); } catch { toast.error("Could not copy. Select the token to copy it."); } }}><Copy className="size-4" /></Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Enter the 20 digits on your meter keypad and press Enter. {p.token?.units != null ? `Units: ${p.token.units}.` : ""}</p>
        </div>
      )}
      {onNew && !["pending_payment", "paid", "vending", "initiated"].includes(p.status) && <Button variant="outline" className="mt-4" onClick={onNew}>Buy another token</Button>}
    </Card>
  );
}
