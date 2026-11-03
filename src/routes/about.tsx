import { createFileRoute, Link } from "@tanstack/react-router";
import logo from "@/assets/logo.png";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About · SmatraPay" },
      { name: "description", content: "Homefield's company introduction, leadership, core values, mission and vision, presented on SmatraPay." },
      { property: "og:title", content: "About · SmatraPay" },
      { property: "og:description", content: "Discover Homefield's commitment to trust, transparency and lasting prosperity through land development." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AboutPage,
});

const values = [
  ["Integrity", "We conduct all transactions with honesty, transparency, and accountability."],
  ["Customer Commitment", "We put our clients’ needs first, ensuring their satisfaction at every stage."],
  ["Excellence", "We deliver quality projects and professional services that exceed expectations."],
  ["Innovation", "We embrace modern development practices for smarter, sustainable land use."],
  ["Community Empowerment", "We create opportunities that uplift and transform local communities."],
];

function AboutPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <a href="#main" className="sr-only focus:not-sr-only focus:inline-block focus:p-4 focus:text-primary">Skip to content</a>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link to="/" aria-label="SmatraPay home" className="inline-flex min-h-11 items-center">
            <img src={logo} alt="SmatraPay" className="h-8 w-auto max-w-48" />
          </Link>
          <Link to="/" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">Back to sign in</Link>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <h1 className="text-3xl font-bold sm:text-4xl">About</h1>
        <p className="mt-4 max-w-3xl text-xl font-semibold leading-relaxed">
          A dynamic land development company founded on the principles of trust, transparency, and transformation.
        </p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Company details below refer to Homefield Properties, reproduced from its {" "}
          <a href="https://homefieldproperties.co.ke/about/" className="text-primary underline underline-offset-4">About page</a>.
        </p>

        <section aria-labelledby="welcome-heading" className="mt-10 border-t border-border pt-8">
          <h2 id="welcome-heading" className="text-2xl font-bold">Welcome to Homefield</h2>
          <div className="mt-5 max-w-3xl space-y-5 text-base leading-8">
            <p>At Homefield, we believe that land is more than a piece of earth; it is a unique appreciating asset, a symbol of progress and a lasting legacy. As a growing company, we are committed to transparent processes, genuine title deeds, and well-planned developments that offer lasting value. Every parcel we deliver represents our belief in a better Kenya — one where more people can invest confidently and prosper together.</p>
            <p>Our tagline, Twatimiza (We keep our word), isn’t just a slogan! It is a reflection of our commitment — to deliver on our promises, to empower dreams, and transform potential into prosperity. We go beyond selling plots; we walk with you, offering honest guidance, reliable service, and a shared vision for long-term growth. Our mission is to make land ownership simple, secure, and rewarding.</p>
            <p>Thank you for trusting Homefield to be part of your journey. Together, let’s build a heritage of progress and prosperity for generations to come.</p>
          </div>
          <div className="mt-7 border-l-2 border-primary pl-5">
            <h3 className="text-lg font-bold">Kimani Mwangi</h3>
            <p className="mt-1 text-sm text-muted-foreground">CHIEF EXECUTIVE OFFICER</p>
          </div>
        </section>

        <section aria-labelledby="values-heading" className="mt-10 border-t border-border pt-8">
          <h2 id="values-heading" className="text-2xl font-bold">Our Core Values</h2>
          <ul className="mt-6 grid gap-x-10 gap-y-7 sm:grid-cols-2">
            {values.map(([title, description]) => (
              <li key={title}>
                <h3 className="text-lg font-semibold text-primary">{title}</h3>
                <p className="mt-2 text-base leading-7">{description}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="mission-heading" className="mt-10 border-t border-border pt-8">
          <h2 id="mission-heading" className="text-2xl font-bold">Our Mission</h2>
          <p className="mt-4 max-w-3xl text-base leading-8">To acquire and develop land projects that offer genuine value, affordability, and long-term growth for our clients, while upholding integrity and excellence in every aspect of our work.</p>
        </section>

        <section aria-labelledby="vision-heading" className="mt-10 border-t border-border pt-8">
          <h2 id="vision-heading" className="text-2xl font-bold">Our Vision</h2>
          <p className="mt-4 max-w-3xl text-base leading-8">To be a leading and trusted land development company in Kenya, enabling individuals and communities to achieve lasting prosperity through land investment.</p>
        </section>

        <section aria-label="Homefield company statistics" className="mt-10 border-t border-border pt-8">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
            {[
              ["MONTHS SERVING KENYANS", "12+"],
              ["PROJECTS COMPLETED", "3"],
              ["TITLE DEEDS DISBURSED", "50+"],
              ["CLIENT SATISFACTION RATE", "100%"],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col">
                <dt className="order-2 mt-3 text-xs font-semibold leading-5 text-muted-foreground">{label}</dt>
                <dd className="text-3xl font-bold text-primary">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
    </div>
  );
}