import { createFileRoute } from "@tanstack/react-router";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";

export const Route = createFileRoute("/_authenticated/vendor/dashboard")({
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorDashboard,
  errorComponent: () => <p className="p-8 text-sm">Could not load this dashboard.</p>,
});

function VendorDashboard() {
  return (
    <DashboardShell
      access={Route.useLoaderData()}
      title="Vendor dashboard"
      description="Manage orders, invoices and settlement timelines."
    />
  );
}
