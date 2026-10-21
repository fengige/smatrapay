import { createFileRoute } from "@tanstack/react-router";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";

export const Route = createFileRoute("/_authenticated/service-provider/dashboard")({
  head: () => ({ meta: [{ title: "Service Provider Dashboard · SmatraPay" }, { name: "description", content: "Your SmatraPay service provider dashboard." }, { property: "og:title", content: "Service Provider Dashboard · SmatraPay" }, { property: "og:description", content: "Your SmatraPay service provider dashboard." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  loader: () => checkRoleAccess({ data: { role: "service_provider" } }),
  component: ServiceProviderDashboard,
  errorComponent: () => <p className="p-8 text-sm">Could not load this dashboard.</p>,
});

function ServiceProviderDashboard() {
  return (
    <DashboardShell
      access={Route.useLoaderData()}
      title="Service provider dashboard"
      description="Track maintenance jobs, schedules and payments."
    />
  );
}
