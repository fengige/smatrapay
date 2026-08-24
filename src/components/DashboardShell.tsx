import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { dashboardForRoles } from "@/lib/portals";
import { PortalLayout, usePortalSignOut } from "@/components/PortalLayout";

export type AccessResult = {
  allowed: boolean;
  roles: string[];
  reason: "ok" | "wrong_portal" | "suspended";
};

export function DashboardShell({
  access,
  title,
  description,
  actions,
  hideHeading,
  children,
}: {
  access: AccessResult;
  title: string;
  description: string;
  actions?: React.ReactNode;
  hideHeading?: boolean;
  children?: React.ReactNode;
}) {
  const signOut = usePortalSignOut();


  if (!access.allowed) {
    const home = dashboardForRoles(access.roles);
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-md text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <ShieldAlert className="size-6" />
          </span>
          <h1 className="mt-5 text-xl font-bold text-foreground">Access denied</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {access.reason === "suspended"
              ? "Your account is not active. Please contact an administrator."
              : "This account does not have access to the selected portal. Please select the correct portal."}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            {access.reason !== "suspended" && (
              <Link to={home} className="btn-primary px-4">
                Go to my dashboard
              </Link>
            )}
            <button onClick={signOut} className="btn-outline px-4">
              Sign out
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <PortalLayout roles={access.roles} title={title} description={description} actions={actions}>
      {children ?? (
        <div className="grid gap-4 sm:grid-cols-3">
          {["Today", "This week", "This month"].map((label) => (
            <div key={label} className="rounded-2xl border border-border bg-card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
              <p className="mt-2 text-2xl font-bold text-foreground">—</p>
            </div>
          ))}
        </div>
      )}
    </PortalLayout>
  );
}
