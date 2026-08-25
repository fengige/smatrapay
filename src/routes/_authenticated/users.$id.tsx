import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  ArrowLeft,
  AtSign,
  Building2,
  CalendarDays,
  Mail,
  Pencil,
  Phone,
  ShieldCheck,
} from "lucide-react";

import { getUserById } from "@/lib/users.functions";
import { PortalLayout } from "@/components/PortalLayout";

export const Route = createFileRoute("/_authenticated/users/$id")({
  head: () => ({
    meta: [
      { title: "User Profile · SmatraPay" },
      {
        name: "description",
        content: "View a SmatraPay account profile: contact details, role, status and notes.",
      },
      { property: "og:title", content: "User Profile · SmatraPay" },
      {
        property: "og:description",
        content: "Account profile with contact details, role, status and internal notes.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UserProfilePage,
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-destructive">{error.message}</div>
  ),
});

const TABS = ["Overview", "Contact", "Activity", "Notes"] as const;
type Tab = (typeof TABS)[number];

const statusStyles: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600",
  pending: "bg-amber-500/10 text-amber-600",
  inactive: "bg-muted text-muted-foreground",
  suspended: "bg-destructive/10 text-destructive",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function roleLabel(role: string) {
  return role
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function UserProfilePage() {
  const { id } = Route.useParams();
  const fetchUser = useServerFn(getUserById);
  const [tab, setTab] = useState<Tab>("Overview");

  const { data, isLoading, error } = useQuery({
    queryKey: ["user", id],
    queryFn: () => fetchUser({ data: { id } }),
  });

  const user = data?.user;
  const role = data?.roles?.[0] ?? "user";
  const initials = (user?.name || user?.email || "U")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <PortalLayout roles={["admin"]} title="User Management" description="User profile">
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Link
              to="/users"
              search={{ page: 1, limit: 10 }}
              aria-label="Back to user management"
              className="mt-1 inline-flex size-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-accent/10"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">User Profile</h1>
              <p className="text-sm text-muted-foreground">
                Profile, contact details, role and account activity
              </p>
            </div>
          </div>

          <Link
            to="/users"
            search={{ page: 1, limit: 10 }}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10"
          >
            <Pencil className="size-4" /> Edit User
          </Link>
        </div>

        {isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-sm text-muted-foreground">
            Loading profile…
          </div>
        ) : error || !user ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-sm text-destructive">
            {(error as Error | null)?.message ?? "User not found"}
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
            {/* Identity card */}
            <aside className="rounded-2xl border border-border bg-card p-6">
              <div className="flex flex-col items-center text-center">
                {user.profile_image ? (
                  <img
                    src={user.profile_image}
                    alt={user.name ?? "User avatar"}
                    className="size-24 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex size-24 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
                    {initials}
                  </div>
                )}
                <h2 className="mt-4 text-lg font-bold text-foreground">
                  {user.name ?? "Unnamed user"}
                </h2>
                <p className="text-sm text-muted-foreground">{roleLabel(role)}</p>
                <span
                  className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                    statusStyles[user.status] ?? statusStyles["inactive"]
                  }`}
                >
                  <span className="size-1.5 rounded-full bg-current" />
                  {user.status}
                </span>
              </div>

              <div className="mt-6 space-y-3 border-t border-border pt-5 text-sm">
                <Row icon={<Mail className="size-4" />} value={user.email ?? "—"} />
                <Row icon={<Phone className="size-4" />} value={user.phone ?? "—"} />
                <Row
                  icon={<AtSign className="size-4" />}
                  value={user.username ? `@${user.username}` : "No username"}
                />
                <Row
                  icon={<ShieldCheck className="size-4" />}
                  value={`Role: ${roleLabel(role)}`}
                />
                <Row
                  icon={<CalendarDays className="size-4" />}
                  value={`Joined ${formatDate(user.created_at)}`}
                />
              </div>
            </aside>

            {/* Main panel */}
            <div className="space-y-5">
              <div className="flex flex-wrap gap-1 rounded-2xl border border-border bg-card p-2">
                {TABS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      tab === t
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent/10 hover:text-foreground"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {tab === "Overview" && (
                <Section title="Account Summary">
                  <dl className="grid gap-6 p-6 sm:grid-cols-2 lg:grid-cols-4">
                    <Detail label="Role" value={roleLabel(role)} />
                    <Detail label="Status" value={user.status} />
                    <Detail
                      label="Email verified"
                      value={user.email_verified_at ? formatDate(user.email_verified_at) : "Not verified"}
                    />
                    <Detail label="User ID" value={user.id.slice(0, 8)} mono />
                  </dl>
                  {user.bio ? (
                    <div className="border-t border-border p-6">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Bio
                      </p>
                      <p className="mt-2 text-sm text-foreground">{user.bio}</p>
                    </div>
                  ) : null}
                </Section>
              )}

              {tab === "Contact" && (
                <Section title="Contact Details">
                  <dl className="grid gap-6 p-6 sm:grid-cols-2">
                    <Detail label="Email address" value={user.email ?? "—"} />
                    <Detail label="Phone number" value={user.phone ?? "—"} />
                    <Detail label="Username" value={user.username ?? "—"} />
                    <Detail label="Profile image" value={user.profile_image ? "Uploaded" : "None"} />
                  </dl>
                </Section>
              )}

              {tab === "Activity" && (
                <Section title="Account Activity">
                  <dl className="grid gap-6 p-6 sm:grid-cols-2 lg:grid-cols-4">
                    <Detail label="Created" value={formatDate(user.created_at)} />
                    <Detail label="Last updated" value={formatDate(user.updated_at)} />
                    <Detail label="Created by" value={user.created_by?.slice(0, 8) ?? "System"} mono />
                    <Detail label="Updated by" value={user.updated_by?.slice(0, 8) ?? "System"} mono />
                  </dl>
                </Section>
              )}

              {tab === "Notes" && (
                <Section title="Internal Notes">
                  <p className="p-6 text-sm text-foreground">
                    {user.notes || "No internal notes recorded for this account."}
                  </p>
                </Section>
              )}
            </div>
          </div>
        )}
      </div>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border px-6 py-4">
        <Building2 className="size-4 text-primary" />
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
