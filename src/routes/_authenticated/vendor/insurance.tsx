import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { checkRoleAccess } from "@/lib/auth.functions";
import { VendorFinancialServicePlaceholder } from "@/components/vendor/VendorFinancialServicePlaceholder";

export const Route = createFileRoute("/_authenticated/vendor/insurance")({
  head: () => ({
    meta: [
      { title: "Insurance · Vendor · SmatraPay" },
      { name: "description", content: "Insurance services for your vendor account." },
      { property: "og:title", content: "Insurance · Vendor · SmatraPay" },
      { property: "og:description", content: "Insurance services for your vendor account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorInsurance,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{(error as Error).message}</p>,
});

function VendorInsurance() {
  const access = Route.useLoaderData();
  return <VendorFinancialServicePlaceholder access={access} title="Insurance" description="Insurance services for your vendor account." icon={ShieldCheck} />;
}
