import { createFileRoute } from "@tanstack/react-router";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { ResidentFeatureLinks } from "@/components/resident/ResidentFeatureLinks";
import { residentHead } from "@/components/resident/ResidentUI";

export const Route = createFileRoute("/_authenticated/resident/more")({
  head: residentHead("More", "Homes, notifications, support and financial service enquiries for SmatraPay residents."),
  loader: () => checkRoleAccess({ data: { role: "resident" } }),
  component: Page,
  errorComponent: () => <p role="alert" className="p-8">Could not open your services. Reconnect and try again.</p>,
  notFoundComponent: () => <p className="p-8">Services not found.</p>,
});
function Page() { return <DashboardShell access={Route.useLoaderData()} title="More" description="Your home, support and enquiries."><ResidentFeatureLinks kind="more" /></DashboardShell>; }