import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  ArrowLeft,
  AtSign,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  CreditCard,
  DoorOpen,
  Download,
  FileText,
  Gauge,
  KeyRound,
  Loader2,
  Mail,
  
  Pencil,
  Phone,
  Receipt,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
} from "lucide-react";
import { toast } from "sonner";

import { deleteUser, getUserById, sendPasswordReset, updateUser } from "@/lib/users.functions";
import { listPaymentMethods, type PaymentMethodRow } from "@/lib/payment-methods.functions";
import { PortalLayout } from "@/components/PortalLayout";
import { PaymentAccountsPanel } from "@/components/PaymentAccountsPanel";
import { UserMpesaConfigSection, isMpesa } from "@/components/UserMpesaConfigSection";
import { MeterAssignmentPanel } from "@/components/MeterAssignmentPanel";
import { ProfileImageEditor } from "@/components/ProfileImageEditor";
import { ProfileImageHistory } from "@/components/ProfileImageHistory";

export const Route = createFileRoute("/_authenticated/vendors/$id/")({
  head: () => ({
    meta: [
      { title: "Vendor Details · SmatraPay" },
      {
        name: "description",
        content:
          "Vendor profile with contact details, property and unit assignment, move-in date and account status history.",
      },
      { property: "og:title", content: "Vendor Details · SmatraPay" },
      {
        property: "og:description",
        content: "Vendor profile, residency details, status history and account actions.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VendorDetailPage,
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => (
    <div className="p-10 text-sm text-muted-foreground">Vendor not found.</div>
  ),
});

const statusTone: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600",
  pending: "bg-amber-500/10 text-amber-600",
  inactive: "bg-muted text-muted-foreground",
  suspended: "bg-destructive/10 text-destructive",
};

function date(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function dateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}


function VendorDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const fetchVendor = useServerFn(getUserById);
  const saveVendor = useServerFn(updateUser);
  const removeVendor = useServerFn(deleteUser);
  const resetPassword = useServerFn(sendPasswordReset);

  const [confirm, setConfirm] = useState<null | "status" | "delete" | "reset">(null);
  const [resetSentAt, setResetSentAt] = useState<string | null>(null);
  const [tab, setTab] = useState<
    "meters" | "invoices" | "payments" | "history" | "notes" | "audit" | "paymethods"
  >("meters");
  const [auditQuery, setAuditQuery] = useState("");
  const [auditAction, setAuditAction] = useState<"all" | "created" | "updated">("all");
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["user", id],
    queryFn: () => fetchVendor({ data: { id } }),
  });

  const vendor = data?.user;



  const statusMutation = useMutation({
    mutationFn: (status: "active" | "inactive") => saveVendor({ data: { id, status } }),
    onSuccess: (_res, status) => {
      toast.success(status === "active" ? "Vendor activated" : "Vendor deactivated");
      queryClient.invalidateQueries({ queryKey: ["user", id] });
      queryClient.invalidateQueries({ queryKey: ["users", "vendor"] });
      setConfirm(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => removeVendor({ data: { id } }),
    onSuccess: () => {
      toast.success("Vendor deleted");
      queryClient.invalidateQueries({ queryKey: ["users", "vendor"] });
      navigate({ to: "/vendors", search: { page: 1, limit: 10, status: "all", q: "" } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetMutation = useMutation({
    mutationFn: () =>
      resetPassword({
        data: { id, redirectTo: `${window.location.origin}/reset-password` },
      }),
    onSuccess: (res) => {
      toast.success(`Password reset email sent to ${res.email}`);
      setResetSentAt(new Date().toISOString());
      setConfirm(null);
    },
    onError: (e: Error) => toast.error(`Could not send reset email: ${e.message}`),
  });

  const initials = (vendor?.name || vendor?.email || "R")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const isActive = vendor?.status === "active";

  const auditEvents = vendor
    ? [
        {
          key: "created",
          action: "created" as const,
          actor: vendor.created_by ? `user ${vendor.created_by.slice(0, 8)}` : "System",
          label: "Record created",
          detail: `By ${vendor.created_by ? `user ${vendor.created_by.slice(0, 8)}` : "System"}`,
          at: vendor.created_at,
          icon: <UserCheck className="size-4" />,
        },
        {
          key: "updated",
          action: "updated" as const,
          actor: vendor.updated_by ? `user ${vendor.updated_by.slice(0, 8)}` : "System",
          label: "Record last updated",
          detail: `By ${vendor.updated_by ? `user ${vendor.updated_by.slice(0, 8)}` : "System"}`,
          at: vendor.updated_at,
          icon: <Pencil className="size-4" />,
        },
      ]
        .filter((e) => e.at)
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    : [];

  const filteredAuditEvents = auditEvents.filter((event) => {
    const q = auditQuery.trim().toLowerCase();
    if (
      q &&
      !event.actor.toLowerCase().includes(q) &&
      !event.label.toLowerCase().includes(q) &&
      !event.detail.toLowerCase().includes(q)
    )
      return false;
    if (auditAction !== "all" && event.action !== auditAction) return false;
    if (auditFrom && new Date(event.at) < new Date(`${auditFrom}T00:00:00`)) return false;
    if (auditTo && new Date(event.at) > new Date(`${auditTo}T23:59:59`)) return false;
    return true;
  });

  const exportAuditCsv = () => {
    const rows = [
      ["Timestamp", "Action", "Actor", "Detail"],
      ...filteredAuditEvents.map((e) => [dateTime(e.at), e.label, e.actor, e.detail]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs-${vendor?.id?.slice(0, 8) ?? "vendor"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredAuditEvents.length} audit event(s) to CSV`);
  };

  const exportAuditPdf = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Vendor Audit Logs", 14, 18);
    doc.setFontSize(10);
    doc.text(`Vendor: ${vendor?.name ?? vendor?.email ?? "—"} (${id.slice(0, 8)})`, 14, 26);
    doc.text(`Exported: ${dateTime(new Date().toISOString())}`, 14, 32);
    let y = 44;
    if (filteredAuditEvents.length === 0) {
      doc.text("No audit events match the current filters.", 14, y);
    }
    for (const e of filteredAuditEvents) {
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
      doc.setFont("helvetica", "bold");
      doc.text(`${dateTime(e.at)} — ${e.label}`, 14, y);
      doc.setFont("helvetica", "normal");
      doc.text(`Actor: ${e.actor} · ${e.detail}`, 14, y + 6);
      y += 14;
    }
    doc.save(`audit-logs-${vendor?.id?.slice(0, 8) ?? "vendor"}.pdf`);
    toast.success(`Exported ${filteredAuditEvents.length} audit event(s) to PDF`);
  };

  const timeline = vendor
    ? [
        {
          key: "created",
          label: "Account created",
          detail: "Vendor record added to SmatraPay",
          at: vendor.created_at,
          icon: <UserCheck className="size-4" />,
        },
        vendor.email_verified_at
          ? {
              key: "verified",
              label: "Email verified",
              detail: vendor.email ?? "",
              at: vendor.email_verified_at,
              icon: <CheckCircle2 className="size-4" />,
            }
          : null,
        vendor.move_in_date
          ? {
              key: "movein",
              label: "Moved in",
              detail: [vendor.property, vendor.building, vendor.unit_number]
                .filter(Boolean)
                .join(" · "),
              at: vendor.move_in_date,
              icon: <DoorOpen className="size-4" />,
            }
          : null,
        {
          key: "updated",
          label: `Status: ${vendor.status}`,
          detail: "Last profile update",
          at: vendor.updated_at,
          icon: <Clock className="size-4" />,
        },
      ]
        .filter(Boolean)
        .sort(
          (a, b) =>
            new Date(b!.at as string).getTime() - new Date(a!.at as string).getTime(),
        )
    : [];

  return (
    <PortalLayout
      roles={["admin"]}
      title="Vendor Management"
      description="Vendor details"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setConfirm("reset")}
            disabled={resetMutation.isPending || !vendor?.email}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10 disabled:opacity-60"
          >
            {resetMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <KeyRound className="size-4" />
            )}
            Send password reset
          </button>
          <Link
            to="/vendors/$id/edit"
            params={{ id }}
            search={{ page: 1, limit: 10, status: "all", q: "" }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Pencil className="size-4" /> Edit Vendor
          </Link>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <Link
            to="/vendors"
            search={{ page: 1, limit: 10, status: "all", q: "" }}
            aria-label="Back to vendor management"
            className="mt-1 inline-flex size-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-accent/10"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Vendor Details</h1>
            <p className="text-sm text-muted-foreground">
              Profile, residency information, status history and account actions
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-sm text-muted-foreground">
            Loading vendor…
          </div>
        ) : error || !vendor ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-sm text-destructive">
            {(error as Error | null)?.message ?? "Vendor not found"}
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
            <aside className="space-y-5">
              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="flex flex-col items-center text-center">
                  <ProfileImageEditor
                    kind="vendor"
                    userId={id}
                    imageUrl={vendor.profile_image ?? null}
                    name={vendor.name ?? null}
                    initials={initials}
                  />
                  <h2 className="mt-4 text-lg font-bold text-foreground">
                    {vendor.name ?? "Unnamed vendor"}
                  </h2>
                  <p className="text-sm text-muted-foreground">Vendor</p>
                  <span
                    className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                      statusTone[vendor.status] ?? statusTone["inactive"]
                    }`}
                  >
                    <span className="size-1.5 rounded-full bg-current" />
                    {vendor.status}
                  </span>
                </div>

                <div className="mt-6 space-y-3 border-t border-border pt-5 text-sm">
                  <Row icon={<Mail className="size-4" />} value={vendor.email ?? "—"} />
                  <Row icon={<Phone className="size-4" />} value={vendor.phone ?? "—"} />
                  <Row
                    icon={<AtSign className="size-4" />}
                    value={vendor.username ? `@${vendor.username}` : "No username"}
                  />
                  <Row
                    icon={<CalendarDays className="size-4" />}
                    value={`Joined ${date(vendor.created_at)}`}
                  />
                </div>
              </div>

              <ProfileImageHistory userId={id} />

              <div className="rounded-2xl border border-border bg-card p-6">
                <h3 className="text-sm font-bold text-foreground">Actions</h3>
                <div className="mt-4 space-y-2">
                  <button
                    type="button"
                    onClick={() => setConfirm("status")}
                    disabled={statusMutation.isPending}
                    className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent/10 disabled:opacity-60"
                  >
                    {isActive ? <UserX className="size-4" /> : <UserCheck className="size-4" />}
                    {isActive ? "Deactivate vendor" : "Activate vendor"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirm("delete")}
                    disabled={deleteMutation.isPending}
                    className="flex w-full items-center gap-2 rounded-lg border border-destructive/40 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
                  >
                    <Trash2 className="size-4" /> Delete vendor
                  </button>
                </div>
              </div>
            </aside>

            <div className="space-y-5">
              <div className="flex flex-wrap gap-1 rounded-2xl border border-border bg-card p-2">
                {(
                  [
                    ["meters", "Meters"],
                    ["invoices", "Invoices"],
                    ["payments", "Payment History"],
                    ["paymethods", "Payment Methods"],
                    ["history", "Status History"],
                    ["notes", "Notes & Bio"],
                    ["audit", "Audit Logs"],
                  ] as const
                ).map(([key, label]) => (
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


              {tab === "history" && (
              <Section title="Status History" icon={<Clock className="size-4 text-primary" />}>
                <ol className="space-y-5 p-6">
                  {timeline.map((event) => (
                    <li key={event!.key} className="flex gap-3">
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        {event!.icon}
                      </span>
                      <div>
                        <p className="text-sm font-semibold capitalize text-foreground">
                          {event!.label}
                        </p>
                        {event!.detail ? (
                          <p className="text-xs text-muted-foreground">{event!.detail}</p>
                        ) : null}
                        <p className="mt-0.5 text-xs text-muted-foreground/80">
                          {dateTime(event!.at as string)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </Section>
              )}

              {tab === "notes" && (
              <Section title="Notes & Bio" icon={<Pencil className="size-4 text-primary" />}>
                <div className="space-y-4 p-6 text-sm">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Bio
                    </p>
                    <p className="mt-1 text-foreground">{vendor.bio || "No bio provided."}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Internal notes
                    </p>
                    <p className="mt-1 text-foreground">
                      {vendor.notes || "No internal notes recorded."}
                    </p>
                  </div>
                </div>
              </Section>
              )}

              {tab === "invoices" && (
                <Section title="Invoices" icon={<Receipt className="size-4 text-primary" />}>
                  <EmptyTabState
                    icon={<Receipt className="size-8" />}
                    title="No invoices yet"
                    description="Utility and rent invoices issued to this vendor will appear here once billing is connected."
                  />
                </Section>
              )}

              {tab === "payments" && (
                <Section title="Payment History" icon={<CreditCard className="size-4 text-primary" />}>
                  <EmptyTabState
                    icon={<CreditCard className="size-8" />}
                    title="No payments recorded"
                    description="Token purchases and invoice payments made by this vendor will appear here."
                  />
                </Section>
              )}

              {tab === "meters" && (
                <MeterAssignmentPanel
                  kind="vendor"
                  ownerId={id}
                  ownerName={vendor?.name || vendor?.email || "this vendor"}
                />
              )}


              {tab === "paymethods" && (
                <>
                  <PaymentAccountsPanel
                    lockUser={{
                      id,
                      name: vendor?.name || vendor?.email || "this vendor",
                      type: "vendor",
                    }}
                  />
                  <UserMpesaConfigSection
                    ownerId={id}
                    ownerName={vendor?.name || vendor?.email || "this vendor"}
                  />
                </>
              )}

              {tab === "audit" && (
                <Section title="Audit Logs" icon={<ShieldCheck className="size-4 text-primary" />}>
                  <div className="flex flex-wrap items-end gap-3 border-b border-border px-6 py-4">
                    <div className="min-w-48 flex-1">
                      <label className="text-xs font-medium text-muted-foreground">Search</label>
                      <div className="relative mt-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="text"
                          value={auditQuery}
                          onChange={(e) => setAuditQuery(e.target.value)}
                          placeholder="Actor, action or detail…"
                          className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Action type</label>
                      <select
                        value={auditAction}
                        onChange={(e) => setAuditAction(e.target.value as typeof auditAction)}
                        className="mt-1 block rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                      >
                        <option value="all">All actions</option>
                        <option value="created">Created</option>
                        <option value="updated">Updated</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">From</label>
                      <input
                        type="date"
                        value={auditFrom}
                        onChange={(e) => setAuditFrom(e.target.value)}
                        className="mt-1 block rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">To</label>
                      <input
                        type="date"
                        value={auditTo}
                        onChange={(e) => setAuditTo(e.target.value)}
                        className="mt-1 block rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={exportAuditCsv}
                        disabled={filteredAuditEvents.length === 0}
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent/10 disabled:opacity-60"
                      >
                        <Download className="size-4" /> CSV
                      </button>
                      <button
                        type="button"
                        onClick={exportAuditPdf}
                        disabled={filteredAuditEvents.length === 0}
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent/10 disabled:opacity-60"
                      >
                        <FileText className="size-4" /> PDF
                      </button>
                    </div>
                  </div>
                  {filteredAuditEvents.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground">
                      No audit events match the current filters.
                    </p>
                  ) : (
                    <ol className="divide-y divide-border">
                      {filteredAuditEvents.map((event) => (
                        <li key={event.key} className="flex items-start gap-3 px-6 py-4">
                          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            {event.icon}
                          </span>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-foreground">{event.label}</p>
                            <p className="text-xs text-muted-foreground">{event.detail}</p>
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground/80">
                            {dateTime(event.at)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </Section>
              )}
            </div>
          </div>
        )}
      </div>

      {resetSentAt ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="size-3.5 text-emerald-600" />
          Reset email last sent {dateTime(resetSentAt)}
        </p>
      ) : null}

      {confirm === "reset" && vendor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
            <h3 className="text-base font-bold text-foreground">Send password reset email?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              A reset link will be emailed to{" "}
              <span className="font-medium text-foreground">{vendor.email}</span>. The vendor
              can use it to set a new password.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resetMutation.isPending}
                onClick={() => resetMutation.mutate()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {resetMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                Send reset email
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirm && confirm !== "reset" && vendor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
            <h3 className="text-base font-bold text-foreground">
              {confirm === "delete"
                ? "Delete vendor?"
                : isActive
                  ? "Deactivate vendor?"
                  : "Activate vendor?"}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {confirm === "delete"
                ? `This permanently removes ${vendor.name ?? "this vendor"} from the platform.`
                : isActive
                  ? "The vendor will lose access until reactivated."
                  : "The vendor will regain access to their portal."}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={statusMutation.isPending || deleteMutation.isPending}
                onClick={() =>
                  confirm === "delete"
                    ? deleteMutation.mutate()
                    : statusMutation.mutate(isActive ? "inactive" : "active")
                }
                className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60 ${
                  confirm === "delete" ? "bg-destructive" : "bg-primary"
                }`}
              >
                {(statusMutation.isPending || deleteMutation.isPending) && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PortalLayout>
  );
}

function EmptyTabState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 p-10 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        {icon}
      </span>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function Row({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="flex items-center gap-3 text-muted-foreground">
      <span className="text-primary">{icon}</span>
      <span className="truncate text-foreground">{value}</span>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border px-6 py-4">
        {icon}
        <h3 className="text-base font-bold text-foreground">{title}</h3>
      </header>
      {children}
    </section>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd
        className={`mt-1 text-sm font-semibold capitalize text-foreground ${mono ? "font-mono lowercase" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
