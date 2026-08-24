import { createFileRoute } from "@tanstack/react-router";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";

export const Route = createFileRoute("/_authenticated/service-provider/dashboard")({
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
