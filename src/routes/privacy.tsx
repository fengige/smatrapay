import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy · SmatraPay" },
      {
        name: "description",
        content:
          "How SmatraPay collects, uses and protects resident, landlord and metering data across the platform.",
      },
      { property: "og:title", content: "Privacy Policy · SmatraPay" },
      {
        property: "og:description",
        content: "How SmatraPay collects, uses and protects your data.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-2xl font-bold text-foreground">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated {new Date().getFullYear()}
      </p>
      <section className="mt-6 space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          We collect account details, contact information, property and unit assignments, meter
          readings and payment records needed to operate the SmatraPay platform.
        </p>
        <p>
          Data is accessible only to authenticated users with an appropriate portal role, enforced
          by row-level security. We never sell personal data.
        </p>
        <p>
          You may request access to, correction of, or deletion of your personal data by contacting
          your portal administrator.
        </p>
      </section>
      <Link to="/" className="mt-8 inline-block text-sm font-semibold text-primary underline-offset-2 hover:underline">
        Back to sign in
      </Link>
    </main>
  );
}
