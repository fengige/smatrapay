import { createFileRoute } from "@tanstack/react-router";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { ComingSoon, residentHead } from "@/components/resident/ResidentUI";
import { EnquiryPanel } from "./support";

export const Route = createFileRoute("/_authenticated/resident/financial-services")({
  head: residentHead("Insurance & Loans", "Send an insurance or loan enquiry to SmatraPay."),
  loader: () => checkRoleAccess({ data: { role: "resident" } }),
  component: Page,
  errorComponent: () => <p className="p-8 text-sm">Could not load this page.</p>,
});

function Page() {
  return (
    <DashboardShell access={Route.useLoaderData()} title="Insurance & Loans" description="No insurance or lending partner is connected yet.">
      <div className="space-y-6">
        <ComingSoon title="Insurance and loan products are coming soon">
          There are no products, rates or online applications yet. Send an enquiry below and our team will follow up — an enquiry is not an application or an approval.
        </ComingSoon>
        <div className="grid gap-6 md:grid-cols-2">
          <EnquiryPanel kind="insurance" title="Insurance enquiry" />
          <EnquiryPanel kind="loan" title="Loan enquiry" />
        </div>
      </div>
    </DashboardShell>
  );
}
