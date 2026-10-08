import { createFileRoute } from "@tanstack/react-router";
import { TransactionRecordsView } from "@/components/TransactionRecordsView";

export const Route = createFileRoute("/_authenticated/vendor/transactions")({
  head: () => ({
    meta: [
      { title: "Vendor Transactions | SmatraPay" },
      { name: "description", content: "Daily history of token sales on your meters." },
      { property: "og:title", content: "Vendor Transactions | SmatraPay" },
      { property: "og:description", content: "Search, filter and export your daily token sales." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <TransactionRecordsView vendor />,
});

