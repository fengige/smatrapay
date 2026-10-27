import { createFileRoute } from "@tanstack/react-router";
import { BadgeDollarSign } from "lucide-react";
import { checkRoleAccess } from "@/lib/auth.functions";
import { VendorFinancialServicePlaceholder } from "@/components/vendor/VendorFinancialServicePlaceholder";

export const Route = createFileRoute("/_authenticated/vendor/loans")({
  head: () => ({
    meta: [
      { title: "Loans · Vendor · SmatraPay" },
      { name: "description", content: "Loan services for your vendor account." },
      { property: "og:title", content: "Loans · Vendor · SmatraPay" },
      { property: "og:description", content: "Loan services for your vendor account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorLoans,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{(error as Error).message}</p>,
});

function VendorLoans() {
  const access = Route.useLoaderData();
  return <VendorFinancialServicePlaceholder access={access} title="Loans" description="Loan services for your vendor account." icon={BadgeDollarSign} />;
}
