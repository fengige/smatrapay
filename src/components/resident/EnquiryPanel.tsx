import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { listMyEnquiries, submitEnquiry } from "@/lib/resident-portal.functions";
import { Badge, Card, Empty, field, when } from "@/components/resident/ResidentUI";
export function EnquiryPanel({ kind, title }: { kind: "support" | "insurance" | "loan" | "sacco"; title: string }) {
  const sendFn = useServerFn(submitEnquiry);
  const listFn = useServerFn(listMyEnquiries);
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["resident-enquiries"], queryFn: () => listFn() });
  const [f, setF] = useState({ subject: "", message: "" });
  const m = useMutation({
    mutationFn: () => sendFn({ data: { kind, ...f } }),
    onSuccess: (r) => { toast.success(`Sent — reference ${r.reference}`); setF({ subject: "", message: "" }); qc.invalidateQueries({ queryKey: ["resident-enquiries"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const mine = (list.data ?? []).filter((e: any) => e.kind === kind);
  return (
    <Card title={title}>
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <input className={field} placeholder="Subject" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} required minLength={3} />
        <textarea className={`${field} h-24 py-2`} placeholder="How can we help?" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} required minLength={5} />
        <button className="btn-primary w-full" disabled={m.isPending}>{m.isPending ? "Sending…" : "Send"}</button>
      </form>
      <div className="mt-4 space-y-2">
        {mine.length === 0 ? <Empty>No requests yet.</Empty> : mine.map((e: any) => (
          <div key={e.id} className="rounded-lg border border-border p-3 text-sm">
            <div className="flex justify-between gap-2"><span className="font-medium">{e.reference}</span><Badge status={e.status}>{e.status}</Badge></div>
            <p className="text-muted-foreground">{e.subject}</p>
            {e.staff_response && <p className="mt-1 text-xs">Reply: {e.staff_response}</p>}
            <p className="text-xs text-muted-foreground">{when(e.created_at)}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
