import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { PortalLayout } from "@/components/PortalLayout";

export const Route = createFileRoute("/_authenticated/configurations")({
  component: ConfigurationsLayout,
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-destructive">{error.message}</div>
  ),
});

const TABS = [
  { to: "/configurations/app-settings", label: "App Settings" },
  { to: "/configurations/sms", label: "SMS Configuration" },
  { to: "/configurations/mail", label: "Mail Configuration" },
  { to: "/configurations/google-map", label: "Google Map API" },
  { to: "/configurations/social-media", label: "Social Media Login" },
  { to: "/configurations/currency", label: "Currency SetUp" },
] as const;

function ConfigurationsLayout() {
  return (
    <PortalLayout
      roles={["admin"]}
      title="Configurations"
      description="System configuration for the SmatraPay portal"
    >
      <nav
        aria-label="Configuration tabs"
        className="-mx-1 overflow-x-auto rounded-2xl border border-border bg-card p-1.5"
      >
        <ul className="flex min-w-max items-center gap-1">
          {TABS.map((tab) => (
            <li key={tab.to}>
              <Link
                to={tab.to}
                activeProps={{
                  className:
                    "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                }}
                className="inline-flex whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground"
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-5">
        <Outlet />
      </div>
    </PortalLayout>
  );
}
