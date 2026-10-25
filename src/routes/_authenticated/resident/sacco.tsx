import { createFileRoute } from "@tanstack/react-router";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { ComingSoon, residentHead } from "@/components/resident/ResidentUI";
import { EnquiryPanel } from "@/components/resident/EnquiryPanel";

export const Route = createFileRoute("/_authenticated/resident/sacco")({
  head: residentHead("Sacco", "Send a sacco enquiry to SmatraPay."),
  loader: () => checkRoleAccess({ data: { role: "resident" } }),
  component: Page,
  errorComponent: () => <p className="p-8 text-sm">Could not load this page.</p>,
});

function Page() {
  return (
    <DashboardShell access={Route.useLoaderData()} title="Sacco" description="No sacco partner is connected yet.">
      <div className="space-y-6">
        <ComingSoon title="Sacco services are coming soon">
          There are no sacco accounts, contribution plans or online applications yet. Send an enquiry below and our team will follow up — an enquiry is not a membership application or an approval.
        </ComingSoon>
        <EnquiryPanel kind="sacco" title="Sacco enquiry" />
      </div>
    </DashboardShell>
  );
}
