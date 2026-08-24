import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, LogOut, Menu, MessageSquare, Search, X } from "lucide-react";
import logo from "@/assets/logo.png";
import { supabase } from "@/integrations/supabase/client";
import { navGroupsForRoles } from "@/lib/portal-nav";
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

function initials(value: string) {
  const parts = value.trim().split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "U";
}

export function useSessionIdentity() {
  const [identity, setIdentity] = useState<{ name: string; email: string }>({
    name: "",
    email: "",
  });
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active || !data.user) return;
      const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
      setIdentity({
        name: (meta["name"] as string) || (data.user.email ?? "").split("@")[0] || "Account",
        email: data.user.email ?? "",
      });
    });
    return () => {
      active = false;
    };
  }, []);
  return identity;
}

export function PortalLayout({
  roles,
  title,
  description,
  actions,
  hideHeading,
  children,
}: {
  roles: string[];
  title: string;
  description?: string;
  actions?: React.ReactNode;
  hideHeading?: boolean | undefined;
  children: React.ReactNode;
}) {
  const signOut = usePortalSignOut();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const groups = navGroupsForRoles(roles);
  const portalName = roles[0] ? roleLabel(roles[0]) : "Portal";
  const identity = useSessionIdentity();
  const avatar = initials(identity.name || identity.email || portalName);

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

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {groups.map((group, gi) => (
          <div key={group.heading ?? gi} className="space-y-1">
            {group.heading && (
              <p className="px-3 pb-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-panel-muted">
                {group.heading}
              </p>
            )}
            {group.items.map((item) => {
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
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 px-3 py-4">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-panel-tile text-xs font-bold">
            {avatar}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{identity.name || "Account"}</p>
            <p className="truncate text-xs text-panel-muted">{portalName}</p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-panel-muted transition-colors hover:bg-panel-tile hover:text-panel-foreground"
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
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/85 px-5 py-3 backdrop-blur">
          <button
            className="rounded-lg border border-border p-2 lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-4" />
          </button>

          <label className="hidden min-w-0 flex-1 items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm text-muted-foreground sm:flex">
            <Search className="size-4 shrink-0" />
            <input
              type="search"
              placeholder="Search anything…"
              aria-label="Search"
              className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>

          <div className="ml-auto flex items-center gap-2">
            {actions}
            <button
              className="relative hidden rounded-full border border-border p-2 text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
              aria-label="Messages"
            >
              <MessageSquare className="size-4" />
              <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-destructive" />
            </button>
            <button
              className="relative hidden rounded-full border border-border p-2 text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
              aria-label="Notifications"
            >
              <Bell className="size-4" />
              <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-destructive" />
            </button>
            <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              {avatar}
            </span>
          </div>
        </header>

        <div className={hideHeading ? "sr-only" : "px-5 pt-5"}>
          <h1 className="text-lg font-bold tracking-tight text-foreground">{title}</h1>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>

        <main className="px-5 pb-8 pt-1">{children}</main>
      </div>
    </div>
  );
}
