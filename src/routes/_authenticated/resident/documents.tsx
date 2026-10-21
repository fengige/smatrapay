import { createFileRoute, Link } from "@tanstack/react-router";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { ComingSoon, residentHead } from "@/components/resident/ResidentUI";

export const Route = createFileRoute("/_authenticated/resident/documents")({
  head: residentHead("My Documents", "Leases, notices and documents shared with you."),
  loader: () => checkRoleAccess({ data: { role: "resident" } }),
  component: Page,
  errorComponent: () => <p className="p-8 text-sm">Could not load this page.</p>,
});

function Page() {
  return (
    <DashboardShell access={Route.useLoaderData()} title="My Documents" description="Leases, notices and shared documents">
      <ComingSoon title="Document sharing is coming soon">
        Landlords can't share leases or notices through SmatraPay yet. Your token statements are available in{" "}
        <Link to="/resident/statements" className="text-primary">My Statements</Link>.
      </ComingSoon>
    </DashboardShell>
  );
}
