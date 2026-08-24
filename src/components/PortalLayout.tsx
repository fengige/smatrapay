import { useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Menu, X } from "lucide-react";
import logo from "@/assets/logo.png";
import { supabase } from "@/integrations/supabase/client";
import { navForRoles } from "@/lib/portal-nav";
import { roleLabel } from "@/lib/portals";

export function usePortalSignOut() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    await navigate({ to: "/auth", replace: true });
  };
}

export function PortalLayout({
  roles,
  title,
  description,
  actions,
  children,
}: {
  roles: string[];
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const signOut = usePortalSignOut();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = navForRoles(roles);
  const portalName = roles[0] ? roleLabel(roles[0]) : "Portal";

  const sidebar = (
    <div className="flex h-full flex-col bg-brand-panel text-panel-foreground">
      <div className="flex items-center justify-between px-5 py-5">
        <Link to="/" className="flex items-center gap-2">
          <img src={logo} alt="SmatraPay" className="h-7 w-auto" />
        </Link>
        <button
          className="rounded-md p-1 text-panel-muted lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close navigation"
        >
          <X className="size-5" />
        </button>
      </div>

      <p className="px-5 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-panel-muted">
        {portalName} portal
      </p>

      <nav className="mt-3 flex-1 space-y-1 px-3">
        {items.map((item) => {
          const active = pathname === item.to;
          return (
            <Link
              key={item.label + item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                active
                  ? "bg-panel-tile text-panel-foreground"
                  : "text-panel-muted hover:bg-panel-tile hover:text-panel-foreground"
              }`}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-5">
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-panel-muted transition-colors hover:bg-panel-tile hover:text-panel-foreground"
        >
          <LogOut className="size-4" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background lg:flex">
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="sticky top-0 h-screen">{sidebar}</div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close navigation overlay"
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-64">{sidebar}</div>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/85 px-5 py-4 backdrop-blur">
          <button
            className="rounded-lg border border-border p-2 lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold tracking-tight text-foreground">{title}</h1>
            {description && (
              <p className="truncate text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {actions}
            <span className="hidden rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground sm:inline">
              {roles.map(roleLabel).join(" · ") || "Member"}
            </span>
          </div>
        </header>

        <main className="px-5 py-7">{children}</main>
      </div>
    </div>
  );
}
