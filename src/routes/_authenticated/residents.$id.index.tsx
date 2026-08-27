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
  DoorOpen,
  KeyRound,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Trash2,
  UserCheck,
  UserX,
} from "lucide-react";
import { toast } from "sonner";

import { deleteUser, getUserById, sendPasswordReset, updateUser } from "@/lib/users.functions";
import { PortalLayout } from "@/components/PortalLayout";

export const Route = createFileRoute("/_authenticated/residents/$id/")({
  head: () => ({
    meta: [
      { title: "Resident Details · SmatraPay" },
      {
        name: "description",
        content:
          "Resident profile with contact details, property and unit assignment, move-in date and account status history.",
      },
      { property: "og:title", content: "Resident Details · SmatraPay" },
      {
        property: "og:description",
        content: "Resident profile, residency details, status history and account actions.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResidentDetailPage,
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => (
    <div className="p-10 text-sm text-muted-foreground">Resident not found.</div>
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

function tenureLabel(moveIn: string | null | undefined) {
  if (!moveIn) return "—";
  const start = new Date(moveIn).getTime();
  if (Number.isNaN(start)) return "—";
  const months = Math.max(0, Math.floor((Date.now() - start) / (1000 * 60 * 60 * 24 * 30.44)));
  if (months < 1) return "Less than a month";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return [years ? `${years} yr${years > 1 ? "s" : ""}` : null, rest ? `${rest} mo` : null]
    .filter(Boolean)
    .join(" ");
}

function ResidentDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const fetchResident = useServerFn(getUserById);
  const saveResident = useServerFn(updateUser);
  const removeResident = useServerFn(deleteUser);
  const resetPassword = useServerFn(sendPasswordReset);

  const [confirm, setConfirm] = useState<null | "status" | "delete" | "reset">(null);
  const [resetSentAt, setResetSentAt] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["user", id],
    queryFn: () => fetchResident({ data: { id } }),
  });

  const resident = data?.user;

  const statusMutation = useMutation({
    mutationFn: (status: "active" | "inactive") => saveResident({ data: { id, status } }),
    onSuccess: (_res, status) => {
      toast.success(status === "active" ? "Resident activated" : "Resident deactivated");
      queryClient.invalidateQueries({ queryKey: ["user", id] });
      queryClient.invalidateQueries({ queryKey: ["users", "resident"] });
      setConfirm(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => removeResident({ data: { id } }),
    onSuccess: () => {
      toast.success("Resident deleted");
      queryClient.invalidateQueries({ queryKey: ["users", "resident"] });
      navigate({ to: "/residents", search: { page: 1, limit: 10 } });
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

  const initials = (resident?.name || resident?.email || "R")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const isActive = resident?.status === "active";

  const timeline = resident
    ? [
        {
          key: "created",
          label: "Account created",
          detail: "Resident record added to SmatraPay",
          at: resident.created_at,
          icon: <UserCheck className="size-4" />,
        },
        resident.email_verified_at
          ? {
              key: "verified",
              label: "Email verified",
              detail: resident.email ?? "",
              at: resident.email_verified_at,
              icon: <CheckCircle2 className="size-4" />,
            }
          : null,
        resident.move_in_date
          ? {
              key: "movein",
              label: "Moved in",
              detail: [resident.property, resident.building, resident.unit_number]
                .filter(Boolean)
                .join(" · "),
              at: resident.move_in_date,
              icon: <DoorOpen className="size-4" />,
            }
          : null,
        {
          key: "updated",
          label: `Status: ${resident.status}`,
          detail: "Last profile update",
          at: resident.updated_at,
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
      title="Resident Management"
      description="Resident details"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setConfirm("reset")}
            disabled={resetMutation.isPending || !resident?.email}
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
            to="/residents/$id/edit"
            params={{ id }}
            search={{ page: 1, limit: 10 }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Pencil className="size-4" /> Edit Resident
          </Link>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <Link
            to="/residents"
            search={{ page: 1, limit: 10 }}
            aria-label="Back to resident management"
            className="mt-1 inline-flex size-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-accent/10"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Resident Details</h1>
            <p className="text-sm text-muted-foreground">
              Profile, residency information, status history and account actions
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-sm text-muted-foreground">
            Loading resident…
          </div>
        ) : error || !resident ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-sm text-destructive">
            {(error as Error | null)?.message ?? "Resident not found"}
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
            <aside className="space-y-5">
              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="flex flex-col items-center text-center">
                  {resident.profile_image ? (
                    <img
                      src={resident.profile_image}
                      alt={resident.name ?? "Resident avatar"}
                      className="size-24 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex size-24 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
                      {initials}
                    </div>
                  )}
                  <h2 className="mt-4 text-lg font-bold text-foreground">
                    {resident.name ?? "Unnamed resident"}
                  </h2>
                  <p className="text-sm text-muted-foreground">Resident</p>
                  <span
                    className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                      statusTone[resident.status] ?? statusTone["inactive"]
                    }`}
                  >
                    <span className="size-1.5 rounded-full bg-current" />
                    {resident.status}
                  </span>
                </div>

                <div className="mt-6 space-y-3 border-t border-border pt-5 text-sm">
                  <Row icon={<Mail className="size-4" />} value={resident.email ?? "—"} />
                  <Row icon={<Phone className="size-4" />} value={resident.phone ?? "—"} />
                  <Row
                    icon={<AtSign className="size-4" />}
                    value={resident.username ? `@${resident.username}` : "No username"}
                  />
                  <Row
                    icon={<CalendarDays className="size-4" />}
                    value={`Joined ${date(resident.created_at)}`}
                  />
                </div>
              </div>

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
                    {isActive ? "Deactivate resident" : "Activate resident"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirm("delete")}
                    disabled={deleteMutation.isPending}
                    className="flex w-full items-center gap-2 rounded-lg border border-destructive/40 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
                  >
                    <Trash2 className="size-4" /> Delete resident
                  </button>
                </div>
              </div>
            </aside>

            <div className="space-y-5">
              <div className="flex flex-wrap gap-1 rounded-2xl border border-border bg-card p-2">
                {(
                  [
                    ["property", "Property & Unit"],
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

              {tab === "property" && (
              <Section title="Property & Unit" icon={<Building2 className="size-4 text-primary" />}>
                <dl className="grid gap-6 p-6 sm:grid-cols-2 lg:grid-cols-4">
                  <Detail label="Property" value={resident.property ?? "Unassigned"} />
                  <Detail label="Building" value={resident.building ?? "—"} />
                  <Detail label="Unit / house no." value={resident.unit_number ?? "—"} />
                  <Detail label="Move-in date" value={date(resident.move_in_date)} />
                  <Detail label="Tenure" value={tenureLabel(resident.move_in_date)} />
                  <Detail label="Account status" value={resident.status} />
                  <Detail
                    label="Email verified"
                    value={resident.email_verified_at ? date(resident.email_verified_at) : "Not verified"}
                  />
                  <Detail label="Resident ID" value={resident.id.slice(0, 8)} mono />
                </dl>
                {resident.property || resident.unit_number ? (
                  <div className="flex items-center gap-2 border-t border-border px-6 py-4 text-sm text-muted-foreground">
                    <MapPin className="size-4 text-primary" />
                    {[resident.property, resident.building, resident.unit_number]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                ) : null}
              </Section>
              )}

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
                    <p className="mt-1 text-foreground">{resident.bio || "No bio provided."}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Internal notes
                    </p>
                    <p className="mt-1 text-foreground">
                      {resident.notes || "No internal notes recorded."}
                    </p>
                  </div>
                </div>
              </Section>
              )}

              {tab === "audit" && (
                <Section title="Audit Logs" icon={<ShieldCheck className="size-4 text-primary" />}>
                  <ol className="divide-y divide-border">
                    {auditEvents.map((event) => (
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

      {confirm === "reset" && resident ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
            <h3 className="text-base font-bold text-foreground">Send password reset email?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              A reset link will be emailed to{" "}
              <span className="font-medium text-foreground">{resident.email}</span>. The resident
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

      {confirm && confirm !== "reset" && resident ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
            <h3 className="text-base font-bold text-foreground">
              {confirm === "delete"
                ? "Delete resident?"
                : isActive
                  ? "Deactivate resident?"
                  : "Activate resident?"}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {confirm === "delete"
                ? `This permanently removes ${resident.name ?? "this resident"} from the platform.`
                : isActive
                  ? "The resident will lose access until reactivated."
                  : "The resident will regain access to their portal."}
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
