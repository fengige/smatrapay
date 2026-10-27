import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { residentHead } from "@/components/resident/ResidentUI";
import { PaygGrid, PaygHowItWorks } from "@/components/payg/PaygCatalog";
import { listResidentPaygProducts } from "@/lib/payg.functions";

export const Route = createFileRoute("/_authenticated/resident/pay-as-you-go")({
  head: residentHead("Pay-as-you-go", "Pay-as-you-go products offered to you."),
  loader: () => checkRoleAccess({ data: { role: "resident" } }),
  component: Page,
  errorComponent: () => <p className="p-8 text-sm">Could not load this page.</p>,
});

function Page() {
  const list = useServerFn(listResidentPaygProducts);
  const q = useQuery({ queryKey: ["resident-payg"], queryFn: () => list() });
  return (
    <DashboardShell access={Route.useLoaderData()} title="Pay-as-you-go" description="Products you can pay for in small instalments.">
      <div className="space-y-6">
        <PaygHowItWorks />
        {q.isLoading ? <p className="text-sm text-muted-foreground">Loading products…</p>
          : q.isError ? <p className="text-sm text-destructive">Could not load products. Please try again.</p>
          : <PaygGrid products={q.data ?? []} empty="No Pay-as-you-go products are offered to you yet." />}
      </div>
    </DashboardShell>
  );
}
