import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listPropertyEnquiries } from "@/lib/property-enquiries.functions";

export const Route = createFileRoute("/_authenticated/property-enquiries")({
  head: () => ({ meta: [{ title: "Smart Meter Enquiries | SmatraPay" }, { name: "description", content: "Read smart meter enquiries sent from the SmatraPay homepage." }, { property: "og:title", content: "Smart Meter Enquiries | SmatraPay" }, { property: "og:description", content: "Homepage smart meter enquiries for administrators." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  loader: () => checkRoleAccess({ data: { role: "admin" } }),
  component: Page,
});

function Page() {
  const access = Route.useLoaderData();
  const fetch = useServerFn(listPropertyEnquiries);
  const [q, setQ] = useState(""), [page, setPage] = useState(1);
  const list = useQuery({ queryKey: ["property-enquiries", q, page], queryFn: () => fetch({ data: { q, page } }), enabled: access.allowed, placeholderData: keepPreviousData });
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / (list.data?.limit ?? 20)));
  return <DashboardShell access={access} title="Smart Meter Enquiries" description="Enquiries sent from the homepage form">
    <div className="space-y-4">
      <Input placeholder="Search name, email, phone or town" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} className="max-w-md" />
      {list.isError && <p className="text-sm text-destructive">Could not load enquiries. <button className="underline" onClick={() => list.refetch()}>Try again</button></p>}
      {list.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : !list.data?.rows.length ? <p className="text-sm text-muted-foreground">No enquiries yet.</p> :
        <div className="space-y-3">{list.data.rows.map(r => <article key={r.id} className="rounded-xl border border-border bg-card p-4 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-semibold">{r.first_name} {r.last_name}</h2><time className="text-muted-foreground">{new Date(r.created_at).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}</time></div>
          <p className="mt-1"><a className="text-primary underline" href={`mailto:${r.email}`}>{r.email}</a> · <a className="text-primary underline" href={`tel:${r.phone.replace(/[^+\d]/g, "")}`}>{r.phone}</a> · {r.city}</p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-4">{[["Premises", r.premises], ["Property type", r.property_type], ["Current main meter", r.current_main_meter], ["Meters needed", r.meters_needed.join(", ")]].map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd>{v || "—"}</dd></div>)}</dl>
          {r.message && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-muted p-3">{r.message}</p>}
        </article>)}</div>}
      <div className="flex items-center gap-2 text-sm"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button><span>Page {page} of {pages}</span><Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</Button></div>
    </div>
  </DashboardShell>;
}
