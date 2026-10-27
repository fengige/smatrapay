import { createFileRoute } from "@tanstack/react-router";
import { Landmark } from "lucide-react";
import { checkRoleAccess } from "@/lib/auth.functions";
import { VendorFinancialServicePlaceholder } from "@/components/vendor/VendorFinancialServicePlaceholder";

export const Route = createFileRoute("/_authenticated/vendor/sacco")({
  head: () => ({
    meta: [
      { title: "Sacco · Vendor · SmatraPay" },
      { name: "description", content: "Sacco services for your vendor account." },
      { property: "og:title", content: "Sacco · Vendor · SmatraPay" },
      { property: "og:description", content: "Sacco services for your vendor account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorSacco,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{(error as Error).message}</p>,
});

function VendorSacco() {
  const access = Route.useLoaderData();
  return <VendorFinancialServicePlaceholder access={access} title="Sacco" description="Sacco services for your vendor account." icon={Landmark} />;
}
