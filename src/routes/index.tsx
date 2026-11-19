import { createFileRoute, Link } from "@tanstack/react-router";
import { Zap, Smartphone, History, Building2, Store, ShieldCheck, CreditCard, Droplets, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SmatraPay — Prepaid Power in Seconds" },
      { name: "description", content: "Buy prepaid electricity, water and gas tokens with M-Pesa. Smart metering and vending for residents, landlords and vendors." },
      { property: "og:title", content: "SmatraPay — Prepaid Power in Seconds" },
      { property: "og:description", content: "Pay with M-Pesa and get your meter token by SMS in seconds. Smart metering for every property." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

const steps = [
  { icon: Smartphone, title: "Buy. Straight from M-Pesa.", text: "Enter your meter number, approve the prompt on your phone, and your token arrives by SMS in seconds." },
  { icon: History, title: "Track. Never lose a token.", text: "Deleted the SMS? Look up your latest tokens any time from your resident account." },
  { icon: Building2, title: "Manage. For vendors and landlords.", text: "Set tariffs, onboard customers, map properties to meters and see every sale as it happens." },
];

const features = [
  { icon: Zap, title: "Instant STS tokens.", sub: "Issued in seconds.", text: "Payments are confirmed and turned into standard 20-digit STS tokens automatically, day or night." },
  { icon: CreditCard, title: "Pay your way.", sub: "M-Pesa or paybill.", text: "Use the M-Pesa prompt or pay through your vendor's paybill with your meter number as the account." },
  { icon: Building2, title: "Built for landlords.", sub: "Every unit, mapped.", text: "Add each property with its units, link meters and follow collections and reports per property." },
  { icon: Store, title: "Built for vendors.", sub: "Your brand, your prices.", text: "Set the price per unit, use your own SMS sender ID and follow your sales on a live dashboard." },
  { icon: ShieldCheck, title: "Fully audited.", sub: "Nothing goes missing.", text: "Every payment, token and settings change is recorded, so every shilling can be reconciled." },
];

function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Zap className="h-5 w-5" /></span>
            SmatraPay
          </Link>
          <Button asChild variant="outline"><Link to="/login">Log in</Link></Button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-20 text-center md:py-28">
        <h1 className="text-4xl font-extrabold tracking-tight md:text-6xl">Prepaid power, <span className="text-primary">in seconds</span></h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Pay with M-Pesa using <strong className="text-foreground">your meter number</strong> as the account. Your token arrives by SMS before you've put your phone down.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg"><Link to="/login">Buy tokens</Link></Button>
          <Button asChild size="lg" variant="outline"><Link to="/login">Log in to the dashboard</Link></Button>
        </div>
        <div className="mt-10 flex justify-center gap-6 text-sm text-muted-foreground">
          <span className="flex items-center gap-1"><Zap className="h-4 w-4 text-primary" />Electricity</span>
          <span className="flex items-center gap-1"><Droplets className="h-4 w-4 text-accent" />Water</span>
          <span className="flex items-center gap-1"><Flame className="h-4 w-4 text-primary" />Gas</span>
        </div>
      </section>

      <section className="bg-muted/50 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-bold md:text-4xl">Just pay.</h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-muted-foreground">Enter your meter number and approve on M-Pesa. <strong className="text-foreground">SmatraPay turns the payment into a token</strong> and texts it straight to you.</p>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {steps.map((s) => (
              <div key={s.title} className="rounded-2xl border border-border bg-card p-6">
                <s.icon className="h-8 w-8 text-primary" />
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-center text-3xl font-bold md:text-4xl">Reliable <span className="text-primary">by default.</span> Built <span className="text-accent">for every meter.</span></h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-card p-6">
              <f.icon className="h-7 w-7 text-accent" />
              <h3 className="mt-4 font-semibold">{f.title} <span className="block text-muted-foreground">{f.sub}</span></h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-primary py-16 text-primary-foreground">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <h2 className="text-3xl font-bold">Lost your token? Find it here.</h2>
          <p className="mt-3 opacity-90">Sign in to your resident account to see your latest tokens.</p>
          <Button asChild size="lg" variant="secondary" className="mt-6"><Link to="/login">Find my token</Link></Button>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-20 text-center">
        <h2 className="text-3xl font-bold">Smart meters <span className="text-primary">for your property.</span></h2>
        <p className="mt-3 text-muted-foreground">Landlords and vendors: tell us about your building and our team will get back to you within one business day.</p>
        <Button asChild size="lg" className="mt-6"><a href="mailto:info@smatrapay.com">Contact us</a></Button>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">© {new Date().getFullYear()} SmatraPay. Smart metering & vending solutions.</footer>
    </div>
  );
}
