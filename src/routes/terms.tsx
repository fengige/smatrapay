import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service · SmatraPay" },
      {
        name: "description",
        content:
          "Terms of Service governing the use of the SmatraPay property, metering and payments platform.",
      },
      { property: "og:title", content: "Terms of Service · SmatraPay" },
      {
        property: "og:description",
        content: "Terms governing use of the SmatraPay platform.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-2xl font-bold text-foreground">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated {new Date().getFullYear()}
      </p>
      <section className="mt-6 space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          By accessing SmatraPay you agree to use the platform lawfully and to keep your account
          credentials secure. Access is granted per portal role and may be revoked for misuse.
        </p>
        <p>
          Property, unit, metering and payment records entered into the platform must be accurate.
          You are responsible for the data you submit and for any activity under your account.
        </p>
        <p>
          Service is provided on an as-available basis. We may update these terms; continued use
          after an update constitutes acceptance.
        </p>
      </section>
      <Link to="/" className="mt-8 inline-block text-sm font-semibold text-primary underline-offset-2 hover:underline">
        Back to sign in
      </Link>
    </main>
  );
}
