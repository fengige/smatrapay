import { createFileRoute } from "@tanstack/react-router";
import { AuthPanel } from "@/components/AuthPanel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sign in to SmatraPay" },
      {
        name: "description",
        content:
          "Sign in to your SmatraPay dashboard to manage users, payments, payouts and real-time transaction insights.",
      },
      { property: "og:title", content: "Sign in to SmatraPay" },
      {
        property: "og:description",
        content:
          "Access your SmatraPay dashboard: secure payments, instant payouts and real-time insights.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPanel,
});
