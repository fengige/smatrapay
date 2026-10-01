import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import {
  ErrorBlock,
  LoadingBlock,
  StatusBadge,
  formatDate,
  titleCase,
  useVendorScope,
} from "@/components/vendor/VendorUI";
import { Field, VendorModal } from "@/components/vendor/VendorModal";
import { uploadEvidence } from "@/components/vendor/evidence";
import {
  REQUEST_STATUSES,
  assignServiceTechnician,
  completeServiceRequest,
  getServiceRequest,
  listInstallationTeams,
  updateServiceRequestStatus,
} from "@/lib/vendor-ops.functions";

export const Route = createFileRoute("/_authenticated/vendor/service-requests/$requestId")({
  head: () => ({
    meta: [
      { title: "Service Request · Vendor · SmatraPay" },
      { name: "description", content: "Service request details, technician assignment and resolution history." },
      { property: "og:title", content: "Service Request · Vendor · SmatraPay" },
      { property: "og:description", content: "Track a maintenance request from report through resolution." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: ServiceRequestDetail,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{(error as Error).message}</p>,
});

function ServiceRequestDetail() {
  const access = Route.useLoaderData();
  const { requestId } = Route.useParams();
  const queryClient = useQueryClient();
  const scope = useVendorScope();
  const fetchRequest = useServerFn(getServiceRequest);
  const fetchTeams = useServerFn(listInstallationTeams);
  const setStatusFn = useServerFn(updateServiceRequestStatus);
  const assignFn = useServerFn(assignServiceTechnician);
  const completeFn = useServerFn(completeServiceRequest);

  const detail = useQuery({
    queryKey: ["vendor-service-request", requestId],
    queryFn: () => fetchRequest({ data: { id: requestId } }),
  });
  const teams = useQuery({ queryKey: ["vendor-teams"], queryFn: () => fetchTeams() });

  const [assigning, setAssigning] = useState(false);
  const [technicianId, setTechnicianId] = useState("");
  const [completing, setCompleting] = useState(false);
  const [resolution, setResolution] = useState("");
  const [workPerformed, setWorkPerformed] = useState("");
  const [partsUsed, setPartsUsed] = useState("");
  const [meterStatusAfter, setMeterStatusAfter] = useState("");
  const [finalReading, setFinalReading] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [beforeFile, setBeforeFile] = useState<File | null>(null);
  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const request = detail.data?.request;
  const events = detail.data?.events ?? [];
  const meters = scope.data?.meters ?? [];
  const meter = request?.meter_id ? meters.find((m) => m.id === request.meter_id) : undefined;

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["vendor-service-request", requestId] }),
      queryClient.invalidateQueries({ queryKey: ["vendor-service-requests"] }),
    ]);

  const statusMutation = useMutation({
    mutationFn: (status: (typeof REQUEST_STATUSES)[number]) => setStatusFn({ data: { id: requestId, status } }),
    onSuccess: async () => {
      await refresh();
      toast.success("Status updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignMutation = useMutation({
    mutationFn: () => assignFn({ data: { id: requestId, technician_id: technicianId } }),
    onSuccess: async () => {
      setAssigning(false);
      await refresh();
      toast.success("Technician assigned");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      setBusy(true);
      try {
        const before = beforeFile ? await uploadEvidence(beforeFile, "service-requests") : undefined;
        const after = afterFile ? await uploadEvidence(afterFile, "service-requests") : undefined;
        return await completeFn({
          data: {
            id: requestId,
            resolution: resolution.trim(),
            work_performed: workPerformed.trim() || undefined,
            parts_used: partsUsed.trim() || undefined,
            meter_status_after: meterStatusAfter.trim() || undefined,
            final_reading: finalReading === "" ? null : Number(finalReading),
            resident_acknowledged: acknowledged,
            ...(before ? { before_photo: before } : {}),
            ...(after ? { after_photo: after } : {}),
          },
        });
      } finally {
        setBusy(false);
      }
    },
    onSuccess: async () => {
      setCompleting(false);
      await refresh();
      toast.success("Request resolved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const technicians = (teams.data?.members ?? []).filter((m) => m.status === "active");

  return (
    <DashboardShell
      access={access}
      title={request ? `Request ${request.request_number}` : "Service request"}
      description="Maintenance request details and service history."
      actions={
        <Link to="/vendor/service-requests" className="btn-outline inline-flex items-center gap-2 px-3 py-1.5 text-sm">
          <ArrowLeft className="size-4" /> Back to requests
        </Link>
      }
    >
      {detail.error ? (
        <ErrorBlock message={(detail.error as Error).message} />
      ) : detail.isLoading || !request ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-4 pb-8">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={request.status} />
            <StatusBadge value={request.priority} />
            {request.status !== "closed" && request.status !== "cancelled" && (
              <>
                <select
                  className="input w-auto"
                  value={request.status}
                  onChange={(e) =>
                    statusMutation.mutate(e.target.value as (typeof REQUEST_STATUSES)[number])
                  }
                  aria-label="Change status"
                >
                  {REQUEST_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {titleCase(s)}
                    </option>
                  ))}
                </select>
                <button className="btn-outline px-3 py-1.5 text-sm" onClick={() => setAssigning(true)}>
                  Assign technician
                </button>
                {request.status !== "resolved" && (
                  <button className="btn-primary px-3 py-1.5 text-sm" onClick={() => setCompleting(true)}>
                    Complete request
                  </button>
                )}
              </>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="text-sm font-bold text-foreground">Request information</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Request number" value={request.request_number} />
                <Field label="Issue type" value={request.issue_type} />
                <Field label="Priority" value={titleCase(request.priority)} />
                <Field label="Status" value={titleCase(request.status)} />
                <Field label="Preferred date" value={formatDate(request.preferred_date)} />
                <Field label="Created" value={formatDate(request.created_at)} />
                <Field label="Last updated" value={formatDate(request.updated_at)} />
                <Field label="Completed" value={formatDate(request.completed_at)} />
              </div>
              {request.description && (
                <p className="mt-3 text-sm text-muted-foreground">{request.description}</p>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="text-sm font-bold text-foreground">Meter, zone and resident</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Meter number" value={meter?.meter_number ?? "—"} />
                <Field label="Serial number" value={meter?.serial_number ?? "—"} />
                <Field label="Meter type" value={meter?.type ?? "—"} />
                <Field label="Zone" value={meter?.zone_name ?? "—"} />
                <Field label="Resident" value={meter?.resident_name ?? "—"} />
                <Field label="Unit" value={meter?.unit_label ?? "—"} />
              </div>
              <h3 className="mt-4 text-sm font-bold text-foreground">Assigned technician</h3>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <Field label="Technician" value={request.technician_name ?? "—"} />
                <Field label="Contact" value={request.technician_phone ?? "—"} />
                <Field label="Assigned on" value={formatDate(request.assigned_at)} />
              </div>
            </section>
          </div>

          {(request.resolution || request.work_performed) && (
            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="text-sm font-bold text-foreground">Resolution</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Resolution" value={request.resolution ?? "—"} />
                <Field label="Work performed" value={request.work_performed ?? "—"} />
                <Field label="Parts used" value={request.parts_used ?? "—"} />
                <Field label="Meter status after" value={request.meter_status_after ?? "—"} />
                <Field label="Final reading" value={request.final_reading ?? "—"} />
                <Field
                  label="Resident acknowledged"
                  value={request.resident_acknowledged ? "Yes" : "No"}
                />
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-bold text-foreground">Service history</h2>
            {events.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No activity recorded yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {events.map((e) => (
                  <li key={e.id} className="rounded-xl border border-border p-3 text-sm">
                    <p className="font-semibold text-foreground">{titleCase(e.event_type)}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.from_status || e.to_status
                        ? `${titleCase(e.from_status) || "—"} → ${titleCase(e.to_status) || "—"} · `
                        : ""}
                      {formatDate(e.created_at)}
                    </p>
                    {e.note && <p className="mt-1 text-sm text-muted-foreground">{e.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {assigning && (
        <VendorModal title="Assign technician" onClose={() => setAssigning(false)}>
          {technicians.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Add team members under Installation Teams before assigning technicians.
            </p>
          ) : (
            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase text-muted-foreground">
                Technician
                <select
                  className="input mt-1"
                  value={technicianId}
                  onChange={(e) => setTechnicianId(e.target.value)}
                >
                  <option value="">Select a technician</option>
                  {technicians.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} — {t.role} ({t.open_requests} open)
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button className="btn-outline px-3 py-1.5 text-sm" onClick={() => setAssigning(false)}>
                  Cancel
                </button>
                <button
                  className="btn-primary px-3 py-1.5 text-sm"
                  disabled={!technicianId || assignMutation.isPending}
                  onClick={() => assignMutation.mutate()}
                >
                  {assignMutation.isPending ? "Assigning…" : "Assign"}
                </button>
              </div>
            </div>
          )}
        </VendorModal>
      )}

      {completing && (
        <VendorModal title="Complete request" onClose={() => setCompleting(false)} wide>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold uppercase text-muted-foreground sm:col-span-2">
              Resolution
              <textarea
                className="input mt-1"
                rows={3}
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
              />
            </label>
            <label className="block text-xs font-semibold uppercase text-muted-foreground">
              Work performed
              <textarea
                className="input mt-1"
                rows={3}
                value={workPerformed}
                onChange={(e) => setWorkPerformed(e.target.value)}
              />
            </label>
            <label className="block text-xs font-semibold uppercase text-muted-foreground">
              Parts used
              <textarea className="input mt-1" rows={3} value={partsUsed} onChange={(e) => setPartsUsed(e.target.value)} />
            </label>
            <label className="block text-xs font-semibold uppercase text-muted-foreground">
              Meter status after service
              <input
                className="input mt-1"
                value={meterStatusAfter}
                onChange={(e) => setMeterStatusAfter(e.target.value)}
              />
            </label>
            <label className="block text-xs font-semibold uppercase text-muted-foreground">
              Final reading
              <input
                className="input mt-1"
                type="number"
                min="0"
                step="0.01"
                value={finalReading}
                onChange={(e) => setFinalReading(e.target.value)}
              />
            </label>
            <label className="block text-xs font-semibold uppercase text-muted-foreground">
              Before photo
              <input
                className="input mt-1"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setBeforeFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <label className="block text-xs font-semibold uppercase text-muted-foreground">
              After photo
              <input
                className="input mt-1"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setAfterFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              Resident acknowledged the work
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-outline px-3 py-1.5 text-sm" onClick={() => setCompleting(false)}>
              Cancel
            </button>
            <button
              className="btn-primary px-3 py-1.5 text-sm"
              disabled={resolution.trim().length < 3 || completeMutation.isPending || busy}
              onClick={() => completeMutation.mutate()}
            >
              {busy || completeMutation.isPending ? "Saving…" : "Mark resolved"}
            </button>
          </div>
        </VendorModal>
      )}
    </DashboardShell>
  );
}
