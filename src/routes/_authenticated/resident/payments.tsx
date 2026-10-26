import { createFileRoute } from "@tanstack/react-router";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { ResidentFeatureLinks } from "@/components/resident/ResidentFeatureLinks";
import { residentHead } from "@/components/resident/ResidentUI";

export const Route = createFileRoute("/_authenticated/resident/payments")({
  head: residentHead("Payments", "Your SmatraPay utility payments, confirmed receipts and token statements."),
  loader: () => checkRoleAccess({ data: { role: "resident" } }),
  component: Page,
  errorComponent: () => <p role="alert" className="p-8">Could not open payments. Reconnect and try again.</p>,
  notFoundComponent: () => <p className="p-8">Payments not found.</p>,
});
function Page() { return <DashboardShell access={Route.useLoaderData()} title="Payments" description="Your payments and records."><ResidentFeatureLinks kind="payments" /></DashboardShell>; }