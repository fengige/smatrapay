import { createFileRoute } from "@tanstack/react-router";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { ComingSoon, residentHead } from "@/components/resident/ResidentUI";
import { EnquiryPanel } from "@/components/resident/EnquiryPanel";

export const Route = createFileRoute("/_authenticated/resident/loans")({
  head: residentHead("Loans", "Send a loan enquiry to SmatraPay."),
  loader: () => checkRoleAccess({ data: { role: "resident" } }),
  component: Page,
  errorComponent: () => <p className="p-8 text-sm">Could not load this page.</p>,
});

function Page() {
  return (
    <DashboardShell access={Route.useLoaderData()} title="Loans" description="No lending partner is connected yet.">
      <div className="space-y-6">
        <ComingSoon title="Loan products are coming soon">
          There are no loan amounts, rates or online applications yet. Send an enquiry below and our team will follow up — an enquiry is not an application or an approval.
        </ComingSoon>
        <EnquiryPanel kind="loan" title="Loan enquiry" />
      </div>
    </DashboardShell>
  );
}
