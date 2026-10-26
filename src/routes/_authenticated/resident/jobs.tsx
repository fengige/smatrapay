import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { JobsView } from "@/components/JobsView";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createMyServiceRequest, listMyMetersForForms } from "@/lib/resident-portal.functions";
import { field } from "@/components/resident/ResidentUI";
import { Button } from "@/components/ui/button";
import { MaintenancePhotos } from "@/components/resident/MaintenancePhotos";

export const Route = createFileRoute("/_authenticated/resident/jobs")({
  head: () => ({ meta: [
    { title: "Maintenance & Service Requests · SmatraPay" },
    { name: "description", content: "Submit maintenance requests and follow their status and service provider updates in SmatraPay." },
    { property: "og:title", content: "Maintenance & Service Requests · SmatraPay" },
    { property: "og:description", content: "Your service requests and provider updates." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  loader: () => checkRoleAccess({ data: { role: "resident" } }),
  component: CustomerJobs,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{error instanceof Error ? error.message : "Could not load your jobs."}</p>,
});

const ISSUES = ["Meter Not Working", "Token Not Accepted", "Meter Display Fault", "Low Battery", "Payment/Token Problem", "Installation Problem", "Other"];

function CustomerJobs() {
  const access = Route.useLoaderData();
  const [open, setOpen] = useState(false);
  return <DashboardShell access={access} title="Maintenance & Service Requests" description="Report a problem and follow its progress."
    actions={<Button onClick={() => setOpen(true)}>New request</Button>}>
    <JobsView mode="customer" />
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto [&_button]:min-h-11 [&_input]:min-h-11 [&_select]:min-h-11">
        <DialogHeader><DialogTitle>New service request</DialogTitle></DialogHeader>
        {open && <RequestForm onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  </DashboardShell>;
}

function RequestForm({ onDone }: { onDone: () => void }) {
  const metersFn = useServerFn(listMyMetersForForms);
  const createFn = useServerFn(createMyServiceRequest);
  const qc = useQueryClient();
  const meters = useQuery({ queryKey: ["resident-form-meters"], queryFn: () => metersFn() });
  const [f, setF] = useState({ meter_id: "", issue_type: ISSUES[0] ?? "Other", priority: "medium" as "low" | "medium" | "high", description: "", preferred_date: "" });
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const m = useMutation({
    mutationFn: () => createFn({ data: { ...f, photo_paths: photos, meter_id: f.meter_id || meters.data?.[0]?.id || "" } }),
    onSuccess: (r) => { toast.success(`Request ${r.request_number} submitted`); qc.invalidateQueries(); onDone(); },
    onError: (e) => toast.error((e as Error).message),
  });
  if (meters.data && meters.data.length === 0) return <p className="text-sm text-muted-foreground">You have no meters linked to your home yet, so a request can't be routed. Contact your property manager.</p>;
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <label className="block text-sm">Meter<select className={`${field} mt-1`} value={f.meter_id} onChange={(e) => setF({ ...f, meter_id: e.target.value })}>
        {(meters.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.type} · {x.meter_number}</option>)}
      </select></label>
      <label className="block text-sm">Issue<select className={`${field} mt-1`} value={f.issue_type} onChange={(e) => setF({ ...f, issue_type: e.target.value })}>{ISSUES.map((i) => <option key={i}>{i}</option>)}</select></label>
      <label className="block text-sm">Priority<select className={`${field} mt-1`} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as never })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
      <label className="block text-sm">Describe the problem<textarea className={`${field} mt-1 h-24 py-2`} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} required minLength={5} /></label>
      <label className="block text-sm">Preferred date (optional)<input type="date" className={`${field} mt-1`} value={f.preferred_date} onChange={(e) => setF({ ...f, preferred_date: e.target.value })} /></label>
      <MaintenancePhotos paths={photos} onChange={setPhotos} onBusy={setUploading} />
      <Button className="w-full" disabled={uploading || m.isPending || meters.isPending || !!meters.error || f.description.trim().length < 5}>{m.isPending ? "Submitting…" : "Submit request"}</Button>
    </form>
  );
}
