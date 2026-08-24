import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, ShieldAlert } from "lucide-react";
import logo from "@/assets/logo.png";
import { supabase } from "@/integrations/supabase/client";
import { dashboardForRoles, roleLabel } from "@/lib/portals";

export type AccessResult = {
  allowed: boolean;
  roles: string[];
  reason: "ok" | "wrong_portal" | "suspended";
};

export function DashboardShell({
  access,
  title,
  description,
  children,
}: {
  access: AccessResult;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    await navigate({ to: "/", replace: true });
  }

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
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <img src={logo} alt="SmatraPay" className="h-7 w-auto" />
          <span className="hidden text-sm font-semibold text-muted-foreground sm:inline">
            {access.roles.map(roleLabel).join(" · ")}
          </span>
        </div>
        <button onClick={signOut} className="btn-outline px-3 text-xs">
          <LogOut className="size-4" />
          Sign out
        </button>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        {children ?? (
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
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
      </main>
    </div>
  );
}
