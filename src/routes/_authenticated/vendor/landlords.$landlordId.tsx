import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Building2,
  DoorOpen,
  FileText,
  Gauge,
  History,
  KeyRound,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Receipt,
  UserCheck,
  UserX,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { EmptyState, ErrorBlock, formatDate, titleCase } from "@/components/vendor/VendorUI";
import { VendorModal } from "@/components/vendor/VendorModal";
import {
  ResidentFormFields,
  UnitPicker,
  emptyResidentForm,
  splitName,
  type ResidentForm,
} from "@/components/vendor/ResidentForms";
import {
  assignVendorLandlordUnit,
  getVendorLandlord,
  listVendorLandlordUnits,
  removeVendorLandlordUnit,
  sendVendorLandlordPasswordReset,
  setVendorLandlordStatus,
  updateVendorLandlord,
} from "@/lib/vendor-landlords.functions";

export const Route = createFileRoute("/_authenticated/vendor/landlords/$landlordId")({
  head: () => ({
    meta: [
      { title: "Landlord Details · Vendor · SmatraPay" },
      {
        name: "description",
        content:
          "Property owner profile with properties, assigned units, payments, meters and account history.",
      },
      { property: "og:title", content: "Landlord Details · Vendor · SmatraPay" },
      {
        property: "og:description",
        content: "Vendor view of a landlord's properties, units, payments and meters.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorLandlordDetailPage,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{error.message}</p>,
  notFoundComponent: () => <p className="p-8 text-sm text-muted-foreground">Landlord not found.</p>,
});

const TABS = [
  { key: "properties", label: "My Properties", icon: Building2 },
  { key: "units", label: "Assigned Units", icon: DoorOpen },
  { key: "invoices", label: "Invoices", icon: FileText },
  { key: "payments", label: "Payment History", icon: Receipt },
  { key: "methods", label: "Payment Methods", icon: Wallet },
  { key: "meters", label: "Meters", icon: Gauge },
  { key: "history", label: "Status History", icon: History },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const money = (value: number, currency = "KES") =>
  `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Badge({ value }: { value: string | null | undefined }) {
  const v = (value ?? "").toLowerCase();
  const tone = v.includes("active")
    ? v.startsWith("in")
      ? "bg-muted text-muted-foreground"
      : "bg-emerald-500/12 text-emerald-600"
    : ["completed", "successful", "paid", "installed"].includes(v)
      ? "bg-emerald-500/12 text-emerald-600"
      : ["pending", "scheduled", "partially_paid"].includes(v)
        ? "bg-amber-500/15 text-amber-600"
        : ["failed", "suspended", "cancelled", "reversed", "overdue"].includes(v)
          ? "bg-destructive/12 text-destructive"
          : "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>
      {titleCase(value) || "—"}
    </span>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-2xl border border-border bg-card">{children}</div>;
}

function VendorLandlordDetailPage() {
  const access = Route.useLoaderData();
  const { landlordId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const fetchLandlord = useServerFn(getVendorLandlord);
  const fetchUnits = useServerFn(listVendorLandlordUnits);
  const saveLandlord = useServerFn(updateVendorLandlord);
  const setStatus = useServerFn(setVendorLandlordStatus);
  const assignUnit = useServerFn(assignVendorLandlordUnit);
  const removeUnit = useServerFn(removeVendorLandlordUnit);
  const sendReset = useServerFn(sendVendorLandlordPasswordReset);

  const { data, isLoading, error } = useQuery({
    queryKey: ["vendor-landlord", landlordId],
    queryFn: () => fetchLandlord({ data: { id: landlordId } }),
  });
  const { data: unitData } = useQuery({
    queryKey: ["vendor-landlord-units"],
    queryFn: () => fetchUnits(),
  });

  const [tab, setTab] = useState<TabKey>("properties");
  const [dialog, setDialog] = useState<
    null | { kind: "edit" } | { kind: "assign" } | { kind: "status" } | { kind: "reset" }
  >(null);
  const [form, setForm] = useState<ResidentForm>(emptyResidentForm);
  const [selectedUnit, setSelectedUnit] = useState("");
  const [reason, setReason] = useState("");

  const landlord = data?.landlord;
  const units = unitData?.units ?? [];
  const assignments = data?.assignments ?? [];
  const currentAssignment = useMemo(() => assignments.find((a) => a.current) ?? null, [assignments]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["vendor-landlord", landlordId] });
    await queryClient.invalidateQueries({ queryKey: ["vendor-landlords"] });
    await queryClient.invalidateQueries({ queryKey: ["vendor-landlord-units"] });
  };

  const close = () => {
    setDialog(null);
    setSelectedUnit("");
    setReason("");
  };

  const editMutation = useMutation({
    mutationFn: () =>
      saveLandlord({
        data: {
          id: landlordId,
          first_name: form.first_name.trim(),
          middle_name: form.middle_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          id_number: form.id_number.trim(),
          address: form.address.trim(),
          status: form.status,
          profile_image: form.profile_image || null,
        },
      }),
    onSuccess: async () => {
      toast.success("Landlord updated");
      await invalidate();
      close();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: (next: "active" | "inactive") =>
      setStatus({ data: { id: landlordId, status: next, ...(reason ? { reason } : {}) } }),
    onSuccess: async (_r, next) => {
      toast.success(next === "active" ? "Landlord activated" : "Landlord deactivated");
      await invalidate();
      close();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignMutation = useMutation({
    mutationFn: () =>
      assignUnit({
        data: {
          landlord_id: landlordId,
          unit_id: selectedUnit,
          ...(reason ? { notes: reason } : {}),
        },
      }),
    onSuccess: async () => {
      toast.success("Unit assigned");
      await invalidate();
      close();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: (assignmentId: string) =>
      removeUnit({ data: { landlord_id: landlordId, assignment_id: assignmentId } }),
    onSuccess: async () => {
      toast.success("Assignment ended");
      await invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetMutation = useMutation({
    mutationFn: () =>
      sendReset({
        data: {
          id: landlordId,
          ...(typeof window !== "undefined"
            ? { redirectTo: `${window.location.origin}/auth` }
            : {}),
        },
      }),
    onSuccess: async () => {
      toast.success("Password reset email sent");
      await invalidate();
      close();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = () => {
    if (!landlord) return;
    setForm({
      ...splitName(landlord.name),
      email: landlord.email ?? "",
      phone: landlord.phone ?? "",
      id_number: landlord.id_number ?? "",
      address: landlord.address ?? "",
      status: (landlord.status === "active" ? "active" : "inactive") as ResidentForm["status"],
      profile_image: landlord.profile_image ?? "",
    });
    setDialog({ kind: "edit" });
  };

  const nextStatus: "active" | "inactive" = landlord?.status === "active" ? "inactive" : "active";

  return (
    <DashboardShell
      access={access}
      title="Landlord Details"
      description="Property owner profile within your vendor scope"
    >
      <div className="space-y-5 pb-6">
        <button
          type="button"
          onClick={() => navigate({ to: "/vendor/landlords" })}
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to Landlord Management
        </button>

        {isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground">
            <Loader2 className="mx-auto mb-2 size-5 animate-spin" /> Loading landlord…
          </div>
        ) : error ? (
          <ErrorBlock message={(error as Error).message} />
        ) : !landlord ? (
          <EmptyState title="Not available" message="This landlord is not within your vendor scope." />
        ) : (
          <>
            <section className="rounded-2xl border border-border bg-card p-6">
              <div className="flex flex-wrap items-start gap-5">
                {landlord.profile_image ? (
                  <img
                    src={landlord.profile_image}
                    alt={`${landlord.name ?? "Landlord"} profile photo`}
                    className="size-20 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex size-20 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">
                    {(landlord.name ?? landlord.email ?? "L").slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-[240px] flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-xl font-bold text-foreground">{landlord.name ?? "—"}</h2>
                    <Badge value={landlord.status} />
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">
                    LL-{landlord.id.slice(0, 8).toUpperCase()}
                  </p>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Mail className="size-3.5" /> {landlord.email ?? "—"}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="size-3.5" /> {landlord.phone ?? "—"}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="size-3.5" />
                      {currentAssignment?.zone_name ?? data?.properties[0]?.zone_name ?? "—"}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Building2 className="size-3.5" /> {data?.properties.length ?? 0} properties
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <DoorOpen className="size-3.5" />
                      {currentAssignment
                        ? `${currentAssignment.property_name ?? ""} · ${currentAssignment.unit_number ?? ""}`
                        : "No unit assigned"}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={openEdit}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10"
                  >
                    <Pencil className="size-4" /> Edit Landlord
                  </button>
                  <button
                    type="button"
                    onClick={() => setDialog({ kind: "reset" })}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10"
                  >
                    <KeyRound className="size-4" /> Send Password Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReason("");
                      setDialog({ kind: "status" });
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10"
                  >
                    {nextStatus === "active" ? (
                      <>
                        <UserCheck className="size-4" /> Activate
                      </>
                    ) : (
                      <>
                        <UserX className="size-4" /> Deactivate
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUnit("");
                      setDialog({ kind: "assign" });
                    }}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                  >
                    <DoorOpen className="size-4" /> Assign Unit
                  </button>
                </div>
              </div>
            </section>

            <div className="flex flex-wrap gap-2">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium ${
                    tab === t.key
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-background text-muted-foreground hover:bg-accent/10"
                  }`}
                >
                  <t.icon className="size-4" /> {t.label}
                </button>
              ))}
            </div>

            {tab === "properties" && (
              <Panel>
                <table className="w-full min-w-[860px] text-left text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Property</th>
                      <th className="px-4 py-3 font-semibold">Code</th>
                      <th className="px-4 py-3 font-semibold">Type</th>
                      <th className="px-4 py-3 font-semibold">Address</th>
                      <th className="px-4 py-3 font-semibold">Zone</th>
                      <th className="px-4 py-3 font-semibold">Units</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Added</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.properties.length ? (
                      data.properties.map((p) => (
                        <tr key={p.id} className="border-t border-border/70">
                          <td className="px-4 py-3 font-medium text-foreground">{p.name}</td>
                          <td className="px-4 py-3 text-muted-foreground">{p.code ?? "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {titleCase(p.property_type) || "—"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{p.address ?? "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground">{p.zone_name ?? "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground">{p.unit_count}</td>
                          <td className="px-4 py-3">
                            <Badge value={p.status} />
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{formatDate(p.created_at)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                          No properties in your scope are owned by this landlord.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Panel>
            )}

            {tab === "units" && (
              <Panel>
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Property</th>
                      <th className="px-4 py-3 font-semibold">Unit</th>
                      <th className="px-4 py-3 font-semibold">Type</th>
                      <th className="px-4 py-3 font-semibold">Zone</th>
                      <th className="px-4 py-3 font-semibold">Unit status</th>
                      <th className="px-4 py-3 font-semibold">Assigned</th>
                      <th className="px-4 py-3 font-semibold">Ended</th>
                      <th className="px-4 py-3 font-semibold">Assignment</th>
                      <th className="px-4 py-3 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.length ? (
                      assignments.map((a) => (
                        <tr key={a.id} className="border-t border-border/70">
                          <td className="px-4 py-3 text-foreground">{a.property_name ?? "—"}</td>
                          <td className="px-4 py-3 font-medium text-foreground">
                            {a.unit_number ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {titleCase(a.unit_type) || "—"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{a.zone_name ?? "—"}</td>
                          <td className="px-4 py-3">
                            <Badge value={a.unit_status} />
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{formatDate(a.start_date)}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {a.end_date ? formatDate(a.end_date) : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <Badge value={a.current ? "current" : "historical"} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            {a.current && (
                              <button
                                type="button"
                                disabled={removeMutation.isPending}
                                onClick={() => removeMutation.mutate(a.id)}
                                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
                              >
                                End assignment
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                          This landlord has no unit assignments yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Panel>
            )}

            {tab === "invoices" && (
              <EmptyState
                title="Invoices are not available yet"
                message="Invoicing is not part of the system yet, so there are no invoices to show for this landlord. Payments received are listed under Payment History."
              />
            )}

            {tab === "payments" && (
              <Panel>
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Date</th>
                      <th className="px-4 py-3 font-semibold">Reference</th>
                      <th className="px-4 py-3 font-semibold">Method</th>
                      <th className="px-4 py-3 font-semibold">Description</th>
                      <th className="px-4 py-3 font-semibold">Amount</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.payments.length ? (
                      data.payments.map((p) => (
                        <tr key={p.id} className="border-t border-border/70">
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatDate(p.paid_at ?? p.created_at)}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                            {p.reference ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{p.method ?? "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground">{p.description ?? "—"}</td>
                          <td className="px-4 py-3 font-medium text-foreground">
                            {money(p.amount, p.currency)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge value={p.status} />
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                          No payments recorded for this landlord.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Panel>
            )}

            {tab === "methods" && (
              <Panel>
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Method</th>
                      <th className="px-4 py-3 font-semibold">Account name</th>
                      <th className="px-4 py-3 font-semibold">Account number</th>
                      <th className="px-4 py-3 font-semibold">Bank / Paybill</th>
                      <th className="px-4 py-3 font-semibold">Branch</th>
                      <th className="px-4 py-3 font-semibold">Default</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.payment_accounts.length ? (
                      data.payment_accounts.map((a) => (
                        <tr key={a.id} className="border-t border-border/70">
                          <td className="px-4 py-3 text-foreground">{a.method ?? "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground">{a.account_name ?? "—"}</td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                            {a.account_number}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {a.bank_name ?? a.paybill_number ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{a.branch ?? "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {a.is_default ? "Yes" : "No"}
                          </td>
                          <td className="px-4 py-3">
                            <Badge value={a.is_active ? "active" : "inactive"} />
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                          No payout accounts on file for this landlord.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Panel>
            )}

            {tab === "meters" && (
              <Panel>
                <table className="w-full min-w-[1100px] text-left text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Meter</th>
                      <th className="px-4 py-3 font-semibold">Serial</th>
                      <th className="px-4 py-3 font-semibold">Type</th>
                      <th className="px-4 py-3 font-semibold">Property / Unit</th>
                      <th className="px-4 py-3 font-semibold">Zone</th>
                      <th className="px-4 py-3 font-semibold">Supplier</th>
                      <th className="px-4 py-3 font-semibold">Installation</th>
                      <th className="px-4 py-3 font-semibold">Current reading</th>
                      <th className="px-4 py-3 font-semibold">Credit</th>
                      <th className="px-4 py-3 font-semibold">Last token</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.meters.length ? (
                      data.meters.map((m) => (
                        <tr key={m.id} className="border-t border-border/70">
                          <td className="px-4 py-3">
                            <Link
                              to="/vendor/meters/$meterId"
                              params={{ meterId: m.id }}
                              className="font-medium text-primary hover:underline"
                            >
                              {m.meter_number}
                            </Link>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                            {m.serial_number}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{titleCase(m.type)}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {[m.property_name, m.unit_number].filter(Boolean).join(" · ") || "—"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{m.zone_name ?? "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground">{m.supplier_name ?? "—"}</td>
                          <td className="px-4 py-3">
                            <Badge value={m.installation_status} />
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {m.current_reading.toLocaleString()}
                            {m.last_reading_at ? ` · ${formatDate(m.last_reading_at)}` : ""}
                          </td>
                          <td
                            className={`px-4 py-3 ${m.low_credit ? "text-destructive" : "text-muted-foreground"}`}
                          >
                            {m.available_credit.toLocaleString()} units
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {m.last_token
                              ? `${m.last_token.units} units · ${formatDate(m.last_token.created_at)}`
                              : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <Badge value={m.status} />
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={11} className="px-4 py-10 text-center text-muted-foreground">
                          No meters linked to this landlord's properties or units.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Panel>
            )}

            {tab === "history" && (
              <Panel>
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Date &amp; time</th>
                      <th className="px-4 py-3 font-semibold">Action</th>
                      <th className="px-4 py-3 font-semibold">Previous status</th>
                      <th className="px-4 py-3 font-semibold">New status</th>
                      <th className="px-4 py-3 font-semibold">Changed by</th>
                      <th className="px-4 py-3 font-semibold">Reason / notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.history.length ? (
                      data.history.map((h) => (
                        <tr key={h.id} className="border-t border-border/70">
                          <td className="px-4 py-3 text-muted-foreground">
                            {new Date(h.created_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 font-medium text-foreground">
                            {titleCase(h.action)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {titleCase(h.previous_status) || "—"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {titleCase(h.new_status) || "—"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{h.actor}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {h.reason ?? h.detail ?? "—"}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                          No history recorded yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Panel>
            )}
          </>
        )}
      </div>

      {dialog?.kind === "edit" && (
        <VendorModal title="Edit Landlord" onClose={close} wide>
          <div className="space-y-4">
            <ResidentFormFields form={form} onChange={setForm} />
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

      {dialog?.kind === "assign" && (
        <VendorModal title="Assign Unit" onClose={close} wide>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Only properties and units inside your vendor scope are listed.
            </p>
            <UnitPicker units={units} value={selectedUnit} onChange={setSelectedUnit} required />
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

      {dialog?.kind === "status" && (
        <VendorModal
          title={nextStatus === "active" ? "Activate landlord" : "Deactivate landlord"}
          onClose={close}
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {nextStatus === "active"
                ? "This landlord will regain access to their account."
                : "This account will become inactive. Properties, units, payments and meter history are kept."}
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
                onClick={() => statusMutation.mutate(nextStatus)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {statusMutation.isPending && <Loader2 className="size-4 animate-spin" />} Confirm
              </button>
            </div>
          </div>
        </VendorModal>
      )}

      {dialog?.kind === "reset" && (
        <VendorModal title="Send password reset email" onClose={close}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              A password reset link will be emailed to{" "}
              <span className="font-medium text-foreground">{landlord?.email ?? "—"}</span>. You will
              never see or set their password.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-outline px-4 py-2" onClick={close}>
                Cancel
              </button>
              <button
                type="button"
                disabled={resetMutation.isPending || !landlord?.email}
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
