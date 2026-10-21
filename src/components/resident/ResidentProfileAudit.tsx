import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listResidentProfileAudit } from "@/lib/resident-profile.functions";
import { auditFilters } from "@/lib/resident-profile";
import type { z } from "zod";

export function ResidentProfileAudit() {
  const fetch = useServerFn(listResidentProfileAudit);
  const initial: z.infer<typeof auditFilters> = { page: 0, activity: "all", status: "all", from: "", to: "" };
  const [filter, setFilter] = useState(initial); const [draft, setDraft] = useState(initial); const [error, setError] = useState("");
  const query = useQuery({ queryKey: ["resident-profile-audit", filter], queryFn: () => fetch({ data: filter }) });
  return <section className="space-y-5 py-6"><h2 className="text-lg font-semibold">Account Activity</h2>
    <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); const parsed = auditFilters.safeParse({ ...draft, page: 0 }); if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the dates."); return; } setError(""); setFilter(parsed.data); }}>
      <div className="space-y-2"><Label htmlFor="audit-activity">Activity</Label><select id="audit-activity" className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={draft.activity} onChange={e => setDraft({ ...draft, activity: e.target.value as typeof draft.activity })}>{["all", "profile", "photo", "password", "mfa", "recovery"].map(v => <option key={v} value={v}>{v === "mfa" ? "2FA" : v === "all" ? "All activities" : v[0]?.toUpperCase() + v.slice(1)}</option>)}</select></div>
      <div className="space-y-2"><Label htmlFor="audit-status">Status</Label><select id="audit-status" className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as typeof draft.status })}>{["all", "success", "failed", "attempt"].map(v => <option key={v}>{v}</option>)}</select></div>
      {(["from", "to"] as const).map(v => <div key={v} className="space-y-2"><Label htmlFor={`audit-${v}`}>{v === "from" ? "From (UTC)" : "To (UTC)"}</Label><Input id={`audit-${v}`} type="date" value={draft[v]} onChange={e => setDraft({ ...draft, [v]: e.target.value })} /></div>)}<Button>Apply</Button><Button type="button" variant="outline" onClick={() => { setDraft(initial); setFilter(initial); setError(""); }}>Clear</Button>
    </form>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {query.isPending ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading activity…</p> : query.error ? <p role="alert" className="text-sm text-destructive">Could not load activity.</p> : !query.data?.rows.length ? <p className="py-10 text-center text-sm text-muted-foreground">No account activity for these filters.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-border text-xs text-muted-foreground"><tr>{["Date and Time", "Activity", "Description", "Status"].map(v => <th className="px-3 py-3" key={v}>{v}</th>)}</tr></thead><tbody>{query.data.rows.map(row => <tr key={row.id} className="border-b border-border"><td className="whitespace-nowrap px-3 py-4">{new Date(row.created_at).toLocaleString()}</td><td className="px-3 py-4 capitalize">{row.activity}</td><td className="px-3 py-4">{row.description}</td><td className={`px-3 py-4 capitalize ${row.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}>{row.status}</td></tr>)}</tbody></table></div>}
    <div className="flex items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{query.data?.count ?? 0} events · Page {filter.page + 1}</p><div className="flex gap-1"><Button size="icon" variant="outline" aria-label="Previous activity page" disabled={!filter.page || query.isFetching} onClick={() => setFilter({ ...filter, page: filter.page - 1 })}><ChevronLeft /></Button><Button size="icon" variant="outline" aria-label="Next activity page" disabled={(filter.page + 1) * 20 >= (query.data?.count ?? 0) || query.isFetching} onClick={() => setFilter({ ...filter, page: filter.page + 1 })}><ChevronRight /></Button></div></div>
  </section>;
}