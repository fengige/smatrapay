import { createFileRoute } from "@tanstack/react-router";
import { BankPaymentsPage } from "@/components/BankPaymentsPage";

export const Route = createFileRoute("/_authenticated/bank-payments")({
  head: () => ({
    meta: [
      { title: "Bank Payments | SmatraPay Admin" },
      { name: "description", content: "NCBA and Sidian payments, failed token generation reasons, retries, search and export." },
      { property: "og:title", content: "Bank Payments | SmatraPay Admin" },
      { property: "og:description", content: "Review, search and export bank payments and retry token generation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <BankPaymentsPage portal="admin" />,
});

