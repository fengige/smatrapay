import { createFileRoute } from "@tanstack/react-router";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";

export const Route = createFileRoute("/_authenticated/landlord/dashboard")({
  loader: () => checkRoleAccess({ data: { role: "landlord" } }),
  component: LandlordDashboard,
  errorComponent: () => <p className="p-8 text-sm">Could not load this dashboard.</p>,
});

function LandlordDashboard() {
  return (
    <DashboardShell
      access={Route.useLoaderData()}
      title="Landlord dashboard"
      description="Track properties, tenants, rent collection and payouts."
    />
  );
}
