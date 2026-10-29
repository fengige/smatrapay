import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { residentHead } from "@/components/resident/ResidentUI";
import { PaygGrid, PaygHowItWorks } from "@/components/payg/PaygCatalog";
import { listResidentPaygProducts } from "@/lib/payg.functions";
import { listResidentPaygSummaries } from "@/lib/payg-summary.functions";
import { getPaygPaymentAvailability, getResidentPaygPlans } from "@/lib/payg-payment.functions";
import { PaygPaymentButton, ResidentPaygPlans } from "@/components/payg/ResidentPaygPayments";

export const Route = createFileRoute("/_authenticated/resident/pay-as-you-go")({
  head: residentHead("Pay-as-you-go", "Pay-as-you-go products offered to you."),
  loader: () => checkRoleAccess({ data: { role: "resident" } }),
  component: Page,
  errorComponent: () => <p className="p-8 text-sm">Could not load this page.</p>,
});

function Page() {
  const readSummaries = useServerFn(listResidentPaygSummaries);
  const summaries = useQuery({ queryKey: ["resident-payg-summaries"], queryFn: () => readSummaries() });
  const list = useServerFn(listResidentPaygProducts);
  const q = useQuery({ queryKey: ["resident-payg"], queryFn: () => list() });
  const availabilityFn = useServerFn(getPaygPaymentAvailability);
  const availability = useQuery({ queryKey: ["resident-payg-availability"], queryFn: () => availabilityFn() });
  const plansFn = useServerFn(getResidentPaygPlans);
  const plans = useQuery({ queryKey: ["resident-payg-plans"], queryFn: () => plansFn() });
  return (
    <DashboardShell access={Route.useLoaderData()} title="Pay-as-you-go" description="Products you can pay for in small instalments.">
      <div className="space-y-6">
        {summaries.isPending ? <p role="status" className="text-sm text-muted-foreground">Loading summary details…</p>
          : summaries.isError ? <p className="text-sm text-destructive">Could not load summary details. Please try again.</p>
          : summaries.data.length ? summaries.data.map(s => <PaygHowItWorks key={s.vendor_id} summary={s.summary_text} vendorName={s.vendor_name ?? "Pay-as-you-go vendor"} />) : <PaygHowItWorks />}
        <ResidentPaygPlans catalogue />
        {q.isLoading ? <p className="text-sm text-muted-foreground">Loading products…</p>
          : q.isError ? <p className="text-sm text-destructive">Could not load products. Please try again.</p>
          : <PaygGrid products={q.data ?? []} empty="No Pay-as-you-go products are offered to you yet." actions={p => <PaygPaymentButton product={p} plan={plans.data?.find(plan => plan.product_id === p.id)} available={!plans.isError && !plans.isLoading && Boolean(availability.data?.find(a => a.vendor_id === p.vendor_id)?.available)} />} />}
      </div>
    </DashboardShell>
  );
}
