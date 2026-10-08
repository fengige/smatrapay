import { createFileRoute } from "@tanstack/react-router";
import { TransactionRecordsView } from "@/components/TransactionRecordsView";

export const Route = createFileRoute("/_authenticated/transaction-records")({
  head: () => ({
    meta: [
      { title: "Transaction Records | SmatraPay Admin" },
      { name: "description", content: "Daily history of every prepaid meter token transaction across banks and vending software." },
      { property: "og:title", content: "Transaction Records | SmatraPay Admin" },
      { property: "og:description", content: "Search, filter and export daily prepaid token transactions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <TransactionRecordsView />,
});

