import { createFileRoute } from "@tanstack/react-router";
import { BankPaymentsPage } from "@/components/BankPaymentsPage";
import { checkRoleAccess } from "@/lib/auth.functions";

export const Route = createFileRoute("/_authenticated/landlord/bank-payments")({
  loader: async () => { const access = await checkRoleAccess({ data: { role: "landlord" } }); if (!access.allowed) throw new Error("Landlord access required"); return access; },
  errorComponent: () => <p role="alert" className="p-8">Landlord access is required to view this page.</p>,
  head: () => ({
    meta: [
      { title: "Bank Payments | SmatraPay Landlord" },
      { name: "description", content: "NCBA and Sidian payments for your meters, failed token generation reasons, retries, search and export." },
      { property: "og:title", content: "Bank Payments | SmatraPay Landlord" },
      { property: "og:description", content: "Review, search and export bank payments and retry token generation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <BankPaymentsPage portal="landlord" />,
});

