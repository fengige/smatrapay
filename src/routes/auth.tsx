import { createFileRoute } from "@tanstack/react-router";
import { AuthPanel } from "@/components/AuthPanel";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in to SmatraPay" },
      {
        name: "description",
        content:
          "Sign in or create your SmatraPay account to manage users, payments and payouts.",
      },
      { property: "og:title", content: "Sign in to SmatraPay" },
      {
        property: "og:description",
        content: "Sign in or create your SmatraPay account to manage users and payments.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPanel,
});
