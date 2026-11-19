import { createFileRoute } from "@tanstack/react-router";
import { AuthPanel } from "@/components/AuthPanel";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in to SmatraPay" },
      {
        name: "description",
        content:
          "Log in to your SmatraPay account to manage residents, meters, payments and payouts.",
      },
      { property: "og:title", content: "Log in to SmatraPay" },
      {
        property: "og:description",
        content: "Log in to your SmatraPay account to manage residents, meters and payments.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPanel,
});
