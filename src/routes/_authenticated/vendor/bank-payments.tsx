import { createFileRoute } from "@tanstack/react-router";
import { BankPaymentsPage } from "@/components/BankPaymentsPage";

export const Route = createFileRoute("/_authenticated/vendor/bank-payments")({
  head: () => ({
    meta: [
      { title: "Bank Payments | SmatraPay Vendor" },
      { name: "description", content: "NCBA and Sidian payments for your meters, failed token generation reasons, retries, search and export." },
      { property: "og:title", content: "Bank Payments | SmatraPay Vendor" },
      { property: "og:description", content: "Review, search and export bank payments and retry token generation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <BankPaymentsPage portal="vendor" />,
});

