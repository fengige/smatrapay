import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, LogOut, Menu, MessageSquare, Search, X } from "lucide-react";
import logo from "@/assets/logo.png";
import { supabase } from "@/integrations/supabase/client";
import { navGroupsForRoles } from "@/lib/portal-nav";
import { roleLabel } from "@/lib/portals";
import { useFooterSettings } from "@/lib/use-footer-settings";

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
  const [identity, setIdentity] = useState<{
    name: string;
    email: string;
    profile_image: string | null;
  }>({
    name: "",
    email: "",
    profile_image: null,
  });
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!active || !data.user) return;
      const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
      const name =
        (meta["name"] as string) || (data.user.email ?? "").split("@")[0] || "Account";
      const { data: profile } = await supabase
        .from("users")
        .select("profile_image")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!active) return;
      setIdentity({
        name,
        email: data.user.email ?? "",
        profile_image: profile?.profile_image ?? null,
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
    <div className="flex h-full min-h-0 flex-col bg-brand-panel text-panel-foreground">
      <div className="shrink-0 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <Link to="/" className="flex min-w-0 items-center gap-2">
            <img src={logo} alt="SmatraPay" className="h-7 w-auto shrink-0" />
          </Link>
          <button
            className="shrink-0 rounded-md p-1 text-panel-muted lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          >
            <X className="size-5" />
          </button>
        </div>
        <p className="mt-2 truncate text-[0.65rem] font-extrabold uppercase tracking-[0.18em] text-panel-muted sm:tracking-[0.22em]">
          {portalName} Portal
        </p>
      </div>

      <nav className="sidebar-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {groups.map((group, gi) => (
          <div key={group.heading ?? gi} className="space-y-1">
            {group.heading && (
              <p className="px-3 pb-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-panel-muted">
                {group.heading}
              </p>
            )}
            {group.items.map((item) => {
              const base =
                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors";
              if (!item.to) {
                return (
                  <span
                    key={item.label}
                    title="Coming soon"
                    className={`${base} cursor-default text-panel-muted hover:bg-panel-tile/60`}
                  >
                    <item.icon className="size-4 shrink-0" />
                    {item.label}
                  </span>
                );
              }
              const active = pathname === item.to;
              return (
                <Link
                  key={item.label + item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={`${base} ${
                    active
                      ? "nav-active text-panel-foreground"
                      : "text-panel-muted hover:bg-panel-tile hover:text-panel-foreground"
                  }`}
                >
                  <item.icon className="size-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 px-3 py-4">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          {identity.profile_image ? (
            <img
              src={identity.profile_image}
              alt={identity.name || "Profile"}
              className="size-9 shrink-0 rounded-full object-cover ring-1 ring-white/10"
            />
          ) : (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-panel-tile text-xs font-bold">
              {avatar}
            </span>
          )}
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
          <div className="absolute inset-y-0 left-0 flex w-[82vw] max-w-72 flex-col">{sidebar}</div>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-background/85 px-3 py-2.5 backdrop-blur sm:gap-3 sm:px-5 sm:py-3">
          <button
            className="shrink-0 rounded-lg border border-border p-2 lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-4" />
          </button>

          <p className="min-w-0 flex-1 truncate text-sm font-bold text-foreground sm:hidden">
            {title}
          </p>

          <label className="hidden min-w-0 flex-1 items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm text-muted-foreground sm:flex">
            <Search className="size-4 shrink-0" />
            <input
              type="search"
              placeholder="Search anything…"
              aria-label="Search"
              className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
            />
            <kbd className="ml-1 hidden rounded-md border border-border bg-background px-1.5 py-0.5 text-[0.65rem] font-semibold text-muted-foreground sm:block">
              ⌘K
            </kbd>
          </label>

          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
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
            {identity.profile_image ? (
              <img
                src={identity.profile_image}
                alt={identity.name || "Profile"}
                className="size-8 shrink-0 rounded-full object-cover ring-1 ring-border sm:size-9"
              />
            ) : (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary sm:size-9">
                {avatar}
              </span>
            )}
          </div>
        </header>

        <div className={hideHeading ? "sr-only" : "px-4 pt-4 sm:px-5 sm:pt-5"}>
          <h1 className="text-base font-bold tracking-tight text-foreground sm:text-lg">{title}</h1>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>

        <main className="px-4 pb-2 pt-1 sm:px-5">{children}</main>

        <PortalFooter />
      </div>
    </div>
  );
}

export function PortalFooter() {
  const footer = useFooterSettings();
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border px-4 py-3 sm:px-5">
      <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground sm:flex-row sm:justify-center sm:gap-3">
        <p className="text-center">© {year} {footer.footer_copyright}</p>
        <span className="hidden sm:inline" aria-hidden="true">·</span>
        <nav className="flex items-center gap-3" aria-label="Legal">
          <a href={footer.footer_terms_url} className="underline-offset-2 hover:text-foreground hover:underline">
            Terms of Service
          </a>
          <a href={footer.footer_privacy_url} className="underline-offset-2 hover:text-foreground hover:underline">
            Privacy Policy
          </a>
        </nav>
      </div>
    </footer>
  );
}
