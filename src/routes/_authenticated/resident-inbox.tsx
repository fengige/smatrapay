import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { MessageSquare, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { field, residentHead, when } from "@/components/resident/ResidentUI";
import { listResidentInbox, replyResidentEnquiry, type InboxRow } from "@/lib/resident-inbox.functions";
import { enquiryReply } from "@/lib/resident-inbox";

export const Route = createFileRoute("/_authenticated/resident-inbox")({
  head: residentHead("Resident Feedback & Enquiries", "Review resident feedback and respond to support, insurance and loan enquiries."),
  loader: () => checkRoleAccess({ data: { role: "admin" } }),
  component: ResidentInbox,
});

function ResidentInbox() {
  const access = Route.useLoaderData();
  const fetch = useServerFn(listResidentInbox);
  const reply = useServerFn(replyResidentEnquiry);
  const qc = useQueryClient();
  const [tab, setTab] = useState<"enquiries" | "feedback">("enquiries");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"support" | "insurance" | "loan" | "">("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<InboxRow | null>(null);
  const [response, setResponse] = useState("");
  const filters = { tab, q, kind: kind || undefined, page };
  const list = useQuery({ queryKey: ["resident-inbox", filters], queryFn: () => fetch({ data: filters }), enabled: access.allowed, placeholderData: keepPreviousData });
  const save = useMutation({
    mutationFn: () => { const data = enquiryReply.parse({ id: selected?.id, response }); return reply({ data }); },
    onSuccess: () => { toast.success("Reply saved"); setSelected(null); qc.invalidateQueries({ queryKey: ["resident-inbox"] }); qc.invalidateQueries({ queryKey: ["resident-enquiries"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / 20));
  return <DashboardShell access={access} title="Resident Feedback & Enquiries" description="Resident messages and feedback"
    actions={<Button variant="outline" onClick={() => list.refetch()} disabled={list.isFetching}><RefreshCw />Refresh</Button>}>
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => { setTab(v as typeof tab); setPage(1); }}>
        <TabsList><TabsTrigger value="enquiries">Enquiries</TabsTrigger><TabsTrigger value="feedback">Feedback</TabsTrigger></TabsList>
      </Tabs>
      <div className="flex flex-wrap gap-3">
        <input aria-label="Search resident messages" className={`${field} max-w-md`} placeholder={tab === "enquiries" ? "Search reference, subject or message" : "Search category or comment"} maxLength={100} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        {tab === "enquiries" && <select aria-label="Enquiry type" className={`${field} w-auto`} value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setPage(1); }}><option value="">All types</option><option value="support">Support</option><option value="insurance">Insurance</option><option value="loan">Loan</option></select>}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm"><thead className="bg-muted text-xs uppercase text-muted-foreground"><tr>
          <th className="px-4 py-3">Resident</th><th className="px-4 py-3">{tab === "enquiries" ? "Reference / Type" : "Category / Rating"}</th><th className="px-4 py-3">{tab === "enquiries" ? "Subject" : "Comment"}</th><th className="px-4 py-3">Received</th><th className="px-4 py-3">Actions</th>
        </tr></thead><tbody>
          {list.isPending ? <tr><td colSpan={5} className="p-8 text-center">Loading…</td></tr> : list.error ? <tr><td colSpan={5} className="p-8 text-center text-destructive">{list.error.message}</td></tr> : !list.data?.rows.length ? <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No {tab} match your search.</td></tr> : list.data.rows.map((r) => <tr key={r.id} className="border-t border-border">
            <td className="px-4 py-3">{r.resident_name}</td><td className="px-4 py-3"><p>{r.reference ?? r.category}</p><p className="text-xs capitalize text-muted-foreground">{r.kind ?? `${r.rating}/5`}</p></td>
            <td className="max-w-sm px-4 py-3"><p className="line-clamp-2 break-words">{r.subject ?? r.comment ?? "—"}</p>{r.status && <p className="text-xs capitalize text-muted-foreground">{r.staff_response ? "Replied" : r.status}</p>}</td>
            <td className="whitespace-nowrap px-4 py-3">{when(r.created_at)}</td><td className="px-4 py-3"><Button variant="outline" size="sm" onClick={() => { setSelected(r); setResponse(r.staff_response ?? ""); }}><MessageSquare />{tab === "enquiries" ? "View / Reply" : "View"}</Button></td>
          </tr>)}
        </tbody></table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"><span>{list.data?.total ?? 0} {tab}</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={page <= 1 || list.isFetching} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page} of {pages}</span><Button variant="outline" size="sm" disabled={page >= pages || list.isFetching} onClick={() => setPage(page + 1)}>Next</Button></div></div>
    </div>
    <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>{selected?.reference ?? "Resident feedback"}</DialogTitle></DialogHeader>
      <p className="text-sm font-medium">{selected?.resident_name}</p><p className="text-sm">{selected?.subject ?? selected?.category}</p><p className="whitespace-pre-wrap break-words text-sm">{selected?.message ?? selected?.comment ?? "No comment"}</p>
      {selected?.reference && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}><label className="block text-sm">Reply<textarea aria-label="Reply to resident" className={`${field} mt-2 h-32 py-2`} value={response} onChange={(e) => setResponse(e.target.value)} required maxLength={2000} /></label><Button disabled={save.isPending || !response.trim()}>{save.isPending ? "Saving…" : "Save reply"}</Button></form>}
    </DialogContent></Dialog>
  </DashboardShell>;
}