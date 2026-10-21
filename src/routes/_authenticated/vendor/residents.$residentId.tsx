import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, DoorOpen, KeyRound, Loader2, Pencil, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";

import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { VendorModal } from "@/components/vendor/VendorModal";
import {
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  StatusBadge,
  formatDate,
  installationLabel,
  titleCase,
} from "@/components/vendor/VendorUI";
import {
  ResidentFormFields,
  UnitPicker,
  emptyResidentForm,
  splitName,
  type ResidentForm,
} from "@/components/vendor/ResidentForms";
import { JobsView } from "@/components/JobsView";
import { ResidentAccountTab } from "@/components/resident/ResidentAccountTab";
import {
  assignVendorResidentUnit,
  getVendorResident,
  listVendorAssignableUnits,
  sendVendorResidentPasswordReset,
  setVendorResidentStatus,
  updateVendorResident,
} from "@/lib/vendor-residents.functions";

export const Route = createFileRoute("/_authenticated/vendor/residents/$residentId")({
  head: () => ({
    meta: [
      { title: "Resident Details · Vendor · SmatraPay" },
      {
        name: "description",
        content:
          "Resident profile, property, invoices, payments, meters and status history within your vendor scope.",
      },
      { property: "og:title", content: "Resident Details · Vendor · SmatraPay" },
      { property: "og:description", content: "Everything you need about one resident you serve." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorResidentDetail,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{(error as Error).message}</p>,
});

const TABS = [
  ["property", "My Property"],
  ["account", "Account"],
  ["invoices", "Invoices"],
  ["payments", "Payment History"],
  ["meters", "Meters"],
  ["jobs", "Jobs"],
  ["history", "Status History"],
] as const;

type TabKey = (typeof TABS)[number][0];

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{value ?? "—"}</dd>
    </div>
  );
}

function dateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

const HISTORY_LABELS: Record<string, string> = {
  resident_created: "Resident created",
  activated: "Activated",
  deactivated: "Deactivated",
  resident_deleted: "Resident archived",
  profile_updated: "Profile updated",
  profile_image_updated: "Profile photo updated",
  unit_assigned: "Unit assigned",
  unit_changed: "Unit changed",
  password_reset_requested: "Password reset requested",
  unit_moved: "Unit assignment moved",
  unit_ended: "Unit assignment ended",
  unit_updated: "Unit assignment updated",
  unit_removed: "Unit assignment removed",
};

function VendorResidentDetail() {
  const access = Route.useLoaderData();
  const { residentId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const fetchResident = useServerFn(getVendorResident);
  const fetchUnits = useServerFn(listVendorAssignableUnits);
  const saveResident = useServerFn(updateVendorResident);
  const setStatus = useServerFn(setVendorResidentStatus);
  const assignUnit = useServerFn(assignVendorResidentUnit);
  const resetPassword = useServerFn(sendVendorResidentPasswordReset);

  const { data, isLoading, error } = useQuery({
    queryKey: ["vendor-resident", residentId],
    queryFn: () => fetchResident({ data: { id: residentId } }),
    retry: false,
  });
  const { data: unitData } = useQuery({
    queryKey: ["vendor-assignable-units"],
    queryFn: () => fetchUnits(),
  });

  const [tab, setTab] = useState<TabKey>("property");
  const [dialog, setDialog] = useState<null | "edit" | "assign" | "status" | "reset">(null);
  const [form, setForm] = useState<ResidentForm>(emptyResidentForm);
  const [selectedUnit, setSelectedUnit] = useState("");
  const [reason, setReason] = useState("");

  const resident = data?.resident;
  const isActive = resident?.status === "active";
  const currentAssignment = (data?.assignments ?? []).find((a) => a.current) ?? null;
  const pastAssignments = (data?.assignments ?? []).filter((a) => !a.current);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["vendor-resident", residentId] });
    await queryClient.invalidateQueries({ queryKey: ["vendor-residents"] });
    await queryClient.invalidateQueries({ queryKey: ["vendor-assignable-units"] });
  };

  const close = () => {
    setDialog(null);
    setReason("");
  };

  const editMutation = useMutation({
    mutationFn: () =>
      saveResident({
        data: {
          id: residentId,
          first_name: form.first_name.trim(),
          middle_name: form.middle_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim(),
          username: form.username?.trim(),
          phone: form.phone.trim(),
          id_number: form.id_number.trim(),
          address: form.address.trim(),
          status: form.status,
          profile_image: form.profile_image || null,
        },
      }),
    onSuccess: async () => {
      toast.success("Resident updated");
      await invalidate();
      close();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignMutation = useMutation({
    mutationFn: () =>
      assignUnit({
        data: { resident_id: residentId, unit_id: selectedUnit, ...(reason ? { notes: reason } : {}) },
      }),
    onSuccess: async () => {
      toast.success("Unit assigned");
      await invalidate();
      close();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: () =>
      setStatus({
        data: { id: residentId, status: isActive ? "inactive" : "active", ...(reason ? { reason } : {}) },
      }),
    onSuccess: async () => {
      toast.success(isActive ? "Resident deactivated" : "Resident activated");
      await invalidate();
      close();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetMutation = useMutation({
    mutationFn: () =>
      resetPassword({ data: { id: residentId, redirectTo: `${window.location.origin}/reset-password` } }),
    onSuccess: async (res) => {
      toast.success(`Password reset email sent to ${res.email}`);
      await invalidate();
      close();
    },
    onError: (e: Error) => toast.error(`Could not send reset email: ${e.message}`),
  });

  const openEdit = () => {
    if (!resident) return;
    setForm({
      ...splitName(resident.name),
      email: resident.email ?? "",
      username: resident.username ?? "",
      phone: resident.phone ?? "",
      id_number: resident.id_number ?? "",
      address: resident.address ?? "",
      status: (resident.status === "active" ? "active" : "inactive") as ResidentForm["status"],
      profile_image: resident.profile_image ?? "",
    });
    setDialog("edit");
  };

  return (
    <DashboardShell access={access} title={resident?.name ?? "Resident"} description="Resident details">
      {error ? (
        <ErrorBlock
          message={
            /denied/i.test((error as Error).message)
              ? "This resident is not part of your vendor scope."
              : (error as Error).message
          }
        />
      ) : isLoading ? (
        <LoadingBlock />
      ) : !resident ? (
        <EmptyState title="Resident not found" message="This resident is not in your vendor scope." />
      ) : (
        <div className="space-y-4 pb-6">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={() => navigate({ to: "/vendor/residents" })}
              className="btn-outline inline-flex items-center gap-1 px-3 py-1"
            >
              <ArrowLeft className="size-3" /> Back to residents
            </button>
            <span>Vendor Portal → Resident Management → {resident.name ?? "Resident"}</span>
          </div>

          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center gap-4">
              {resident.profile_image ? (
                <img
                  src={resident.profile_image}
                  alt={`${resident.name ?? "Resident"} profile photo`}
                  className="size-16 rounded-full object-cover"
                />
              ) : (
                <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
                  {(resident.name ?? resident.email ?? "R").slice(0, 1).toUpperCase()}
                </span>
              )}
              <dl className="grid flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Info label="Full name" value={resident.name ?? "—"} />
                <Info
                  label="Resident ID"
                  value={<span className="font-mono text-xs">RES-{residentId.slice(0, 8).toUpperCase()}</span>}
                />
                <Info label="Phone" value={resident.phone ?? "—"} />
                <Info label="Email" value={resident.email ?? "—"} />
                <Info label="Account status" value={<StatusBadge value={resident.status} />} />
                <Info label="Property" value={currentAssignment?.property_name ?? "—"} />
                <Info label="Unit" value={currentAssignment?.unit_number ?? "—"} />
                <Info label="Zone" value={currentAssignment?.zone_name ?? "—"} />
              </dl>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={openEdit}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                <Pencil className="size-4" /> Edit resident
              </button>
              <button
                type="button"
                onClick={() => setDialog("reset")}
                disabled={!resident.email}
                className="btn-outline inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium disabled:opacity-60"
              >
                <KeyRound className="size-4" /> Send password reset email
              </button>
              <button
                type="button"
                onClick={() => setDialog("status")}
                className="btn-outline inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium"
              >
                {isActive ? <UserX className="size-4" /> : <UserCheck className="size-4" />}
                {isActive ? "Deactivate" : "Activate"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedUnit(currentAssignment?.unit_id ?? "");
                  setDialog("assign");
                }}
                className="btn-outline inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium"
              >
                <DoorOpen className="size-4" /> Assign unit
              </button>
            </div>
          </section>

          <div className="flex flex-wrap gap-1 rounded-2xl border border-border bg-card p-2">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  tab === key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent/10 hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "account" && <ResidentAccountTab id={residentId} portal="vendor" />}
          {tab === "property" && (
            <section className="space-y-4">
              {currentAssignment ? (
                <div className="rounded-2xl border border-border bg-card p-5">
                  <h2 className="text-sm font-bold text-foreground">Current assignment</h2>
                  <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Info label="Property name" value={currentAssignment.property_name ?? "—"} />
                    <Info label="Property address" value={currentAssignment.property_address ?? "—"} />
                    <Info label="Zone" value={currentAssignment.zone_name ?? "—"} />
                    <Info label="Unit number" value={currentAssignment.unit_number ?? "—"} />
                    <Info label="Unit type" value={titleCase(currentAssignment.unit_type)} />
                    <Info label="Unit status" value={titleCase(currentAssignment.unit_status)} />
                    <Info label="Assignment date" value={formatDate(currentAssignment.start_date)} />
                    <Info label="Owner type" value={titleCase(currentAssignment.owner_type)} />
                    <Info
                      label="Assigned meters"
                      value={
                        (data?.meters ?? []).length
                          ? (data?.meters ?? []).map((m) => m.meter_number).join(", ")
                          : "—"
                      }
                    />
                  </dl>
                </div>
              ) : (
                <EmptyState
                  title="No current unit"
                  message="This resident does not have an active unit assignment. Use Assign unit to add one."
                />
              )}

              {pastAssignments.length > 0 && (
                <div className="rounded-2xl border border-border bg-card">
                  <header className="border-b border-border px-4 py-3">
                    <h2 className="text-sm font-bold text-foreground">Previous assignments</h2>
                  </header>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2">Property</th>
                          <th className="px-4 py-2">Unit</th>
                          <th className="px-4 py-2">Zone</th>
                          <th className="px-4 py-2">From</th>
                          <th className="px-4 py-2">To</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pastAssignments.map((a) => (
                          <tr key={a.id} className="border-t border-border">
                            <td className="px-4 py-2">{a.property_name ?? "—"}</td>
                            <td className="px-4 py-2">{a.unit_number ?? "—"}</td>
                            <td className="px-4 py-2 text-muted-foreground">{a.zone_name ?? "—"}</td>
                            <td className="px-4 py-2 text-muted-foreground">{formatDate(a.start_date)}</td>
                            <td className="px-4 py-2 text-muted-foreground">{formatDate(a.end_date)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          )}

          {tab === "invoices" && (
            <EmptyState
              title="No invoices"
              message="SmatraPay bills residents through prepaid token purchases, so there is no invoice ledger for this resident yet. Payments appear under Payment History."
            />
          )}

          {tab === "payments" && (
            <section className="rounded-2xl border border-border bg-card">
              <header className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-bold text-foreground">Payment history</h2>
                <p className="text-xs text-muted-foreground">
                  {(data?.payments ?? []).length} transaction(s) recorded for this resident
                </p>
              </header>
              {(data?.payments ?? []).length === 0 ? (
                <EmptyState title="No payments" message="No payment records exist for this resident." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2">Date</th>
                        <th className="px-4 py-2">Reference</th>
                        <th className="px-4 py-2">Method</th>
                        <th className="px-4 py-2">Description</th>
                        <th className="px-4 py-2">Property / unit</th>
                        <th className="px-4 py-2">Amount</th>
                        <th className="px-4 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.payments ?? []).map((p) => (
                        <tr key={p.id} className="border-t border-border">
                          <td className="px-4 py-2">{formatDate(p.paid_at ?? p.created_at)}</td>
                          <td className="px-4 py-2 font-mono text-xs">{p.reference ?? "—"}</td>
                          <td className="px-4 py-2 text-muted-foreground">{p.method ?? "—"}</td>
                          <td className="px-4 py-2 text-muted-foreground">{p.description ?? "—"}</td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {currentAssignment?.property_name ?? "—"}
                            {currentAssignment?.unit_number ? ` · ${currentAssignment.unit_number}` : ""}
                          </td>
                          <td className="px-4 py-2">
                            {p.currency} {p.amount.toLocaleString()}
                          </td>
                          <td className="px-4 py-2">
                            <StatusBadge value={p.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {tab === "meters" && (
            <section className="space-y-4">
              {(data?.meters ?? []).length === 0 ? (
                <EmptyState
                  title="No meters"
                  message="No meters are linked to this resident's unit in your vendor scope."
                />
              ) : (
                (data?.meters ?? []).map((m) => (
                  <div key={m.id} className="rounded-2xl border border-border bg-card p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-sm font-bold text-foreground">Meter {m.meter_number}</h2>
                      <Link
                        to="/vendor/meters/$meterId"
                        params={{ meterId: m.id }}
                        className="text-xs font-semibold text-primary"
                      >
                        View meter
                      </Link>
                    </div>
                    <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <Info label="Serial number" value={m.serial_number} />
                      <Info label="Meter type" value={titleCase(m.type)} />
                      <Info label="Property" value={m.property_name ?? "—"} />
                      <Info label="Unit" value={m.unit_number ?? "—"} />
                      <Info label="Zone" value={m.zone_name ?? "—"} />
                      <Info label="Supplier" value={m.supplier_name ?? "—"} />
                      <Info label="Meter status" value={<StatusBadge value={m.status} />} />
                      <Info label="Installation" value={installationLabel(m.installation_status)} />
                      <Info label="Installation date" value={formatDate(m.installation_date)} />
                      <Info label="Current reading" value={m.current_reading.toLocaleString()} />
                      <Info label="Last reading" value={formatDate(m.last_reading_at)} />
                      <Info
                        label="Available credit"
                        value={
                          <span className={m.low_credit ? "font-semibold text-amber-600" : undefined}>
                            {m.available_credit.toLocaleString()} units
                            {m.low_credit ? " · low" : ""}
                          </span>
                        }
                      />
                      <Info
                        label="Last token"
                        value={
                          m.last_token
                            ? `${m.last_token.token} · ${m.last_token.units} units · ${formatDate(m.last_token.created_at)}`
                            : "—"
                        }
                      />
                    </dl>
                  </div>
                ))
              )}
            </section>
          )}

          {tab === "jobs" && (
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="mb-4 text-sm font-bold text-foreground">Jobs</h2>
              <JobsView mode="vendor" residentId={residentId} />
            </section>
          )}

          {tab === "history" && (
            <section className="rounded-2xl border border-border bg-card">
              <header className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-bold text-foreground">Status history</h2>
              </header>
              {(data?.history ?? []).length === 0 ? (
                <EmptyState
                  title="No history yet"
                  message="Status changes, unit assignments and profile updates will appear here."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2">Date &amp; time</th>
                        <th className="px-4 py-2">Action</th>
                        <th className="px-4 py-2">Previous status</th>
                        <th className="px-4 py-2">New status</th>
                        <th className="px-4 py-2">Changed by</th>
                        <th className="px-4 py-2">Reason / notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.history ?? []).map((h) => (
                        <tr key={h.id} className="border-t border-border">
                          <td className="px-4 py-2">{dateTime(h.created_at)}</td>
                          <td className="px-4 py-2">
                            {HISTORY_LABELS[h.action] ?? titleCase(h.action.replace(/_/g, " "))}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {h.previous_status ? titleCase(h.previous_status) : "—"}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {h.new_status ? titleCase(h.new_status) : "—"}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">{h.actor}</td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {h.reason ?? h.detail ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {dialog === "edit" && (
        <VendorModal title="Edit Resident" onClose={close} wide>
          <div className="space-y-4">
            <ResidentFormFields form={form} onChange={setForm} residentId={residentId} />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-outline px-4 py-2" onClick={close}>
                Cancel
              </button>
              <button
                type="button"
                disabled={editMutation.isPending}
                onClick={() => editMutation.mutate()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {editMutation.isPending && <Loader2 className="size-4 animate-spin" />} Save changes
              </button>
            </div>
          </div>
        </VendorModal>
      )}

      {dialog === "assign" && (
        <VendorModal title="Assign Unit" onClose={close} wide>
          <div className="space-y-4">
            <UnitPicker units={unitData?.units ?? []} value={selectedUnit} onChange={setSelectedUnit} required />
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-muted-foreground">Notes (optional)</span>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-outline px-4 py-2" onClick={close}>
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedUnit || assignMutation.isPending}
                onClick={() => assignMutation.mutate()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {assignMutation.isPending && <Loader2 className="size-4 animate-spin" />} Assign unit
              </button>
            </div>
          </div>
        </VendorModal>
      )}

      {dialog === "status" && (
        <VendorModal title={isActive ? "Deactivate resident" : "Activate resident"} onClose={close}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {isActive
                ? "This resident's account will become inactive. Meter, payment and assignment history is kept."
                : "This resident will regain access to their account."}
            </p>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-muted-foreground">Reason (optional)</span>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-outline px-4 py-2" onClick={close}>
                Cancel
              </button>
              <button
                type="button"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {statusMutation.isPending && <Loader2 className="size-4 animate-spin" />} Confirm
              </button>
            </div>
          </div>
        </VendorModal>
      )}

      {dialog === "reset" && (
        <VendorModal title="Send password reset email" onClose={close}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              A password reset link will be emailed to <strong>{resident?.email}</strong>. You will never
              see the resident's password.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-outline px-4 py-2" onClick={close}>
                Cancel
              </button>
              <button
                type="button"
                disabled={resetMutation.isPending}
                onClick={() => resetMutation.mutate()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {resetMutation.isPending && <Loader2 className="size-4 animate-spin" />} Send email
              </button>
            </div>
          </div>
        </VendorModal>
      )}
    </DashboardShell>
  );
}
