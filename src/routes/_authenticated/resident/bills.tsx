import { createFileRoute, Link } from "@tanstack/react-router";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { ComingSoon, residentHead } from "@/components/resident/ResidentUI";

export const Route = createFileRoute("/_authenticated/resident/bills")({
  head: residentHead("Pay Rent & Bills", "Rent, service charge invoices and receipts."),
  loader: () => checkRoleAccess({ data: { role: "resident" } }),
  component: Page,
  errorComponent: () => <p className="p-8 text-sm">Could not load this page.</p>,
});

function Page() {
  return (
    <DashboardShell access={Route.useLoaderData()} title="Pay Rent & Bills" description="Invoices & receipts">
      <ComingSoon title="Rent and bill payments are coming soon">
        Your landlord doesn't issue invoices through SmatraPay yet, so there's nothing to pay here. Token receipts are in{" "}
        <Link to="/resident/transactions" className="text-primary">My Transactions</Link>.
      </ComingSoon>
    </DashboardShell>
  );
}
