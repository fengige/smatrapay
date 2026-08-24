import { createFileRoute } from "@tanstack/react-router";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";

export const Route = createFileRoute("/_authenticated/resident/dashboard")({
  loader: () => checkRoleAccess({ data: { role: "resident" } }),
  component: ResidentDashboard,
  errorComponent: () => <p className="p-8 text-sm">Could not load this dashboard.</p>,
});

function ResidentDashboard() {
  return (
    <DashboardShell
      access={Route.useLoaderData()}
      title="Resident dashboard"
      description="Your rent, bills, service requests and payment history."
    />
  );
}
