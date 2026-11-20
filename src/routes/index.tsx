import { createFileRoute, Link } from "@tanstack/react-router";
import { Zap, Smartphone, History, Building2, Store, ShieldCheck, CreditCard, Droplets, Flame, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
const field = "h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";


import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { submitPropertyEnquiry } from "@/lib/property-enquiries.functions";
import { propertyEnquirySchema } from "@/lib/property-enquiries";
import logoAsset from "@/assets/smatrapay-logo.png.asset.json";

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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link to="/" className="flex items-center" aria-label="SmartShop home">
            <img src={logoAsset.url} alt="SmartShop" className="h-6 w-auto sm:h-8" />
          </Link>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Button asChild className="px-3 text-xs sm:px-5 sm:text-sm"><Link to="/mytokens">Token Checker</Link></Button>
            <Button asChild className="px-3 text-xs sm:px-5 sm:text-sm"><Link to="/vendor-register">Become a Vendor</Link></Button>
            <Button asChild variant="outline" className="px-3 text-xs sm:px-5 sm:text-sm"><Link to="/login">Log in</Link></Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <h1 className="text-4xl font-normal tracking-tight md:text-6xl">Smart meters <span className="font-bold">for your property.</span></h1>
        <p className="mt-3 max-w-xl text-muted-foreground">Tell us about your building and our team will get back to you within one business day.</p>
        <EnquiryForm />
        
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

function EnquiryForm() {
  const submit = useServerFn(submitPropertyEnquiry);
  const [busy, setBusy] = useState(false), [sent, setSent] = useState(false);
  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget, d = new FormData(form), v = (k: string) => String(d.get(k) ?? "").trim() || undefined;
    const parsed = propertyEnquirySchema.safeParse({ first_name: v("first") ?? "", last_name: v("last") ?? "", email: v("email") ?? "", phone: v("phone") ?? "", city: v("city") ?? "", premises: v("premises"), property_type: v("propertyType"), current_main_meter: v("mainMeter"), meters_needed: d.getAll("meters"), message: v("message") });
    if (!parsed.success) return void toast.error(parsed.error.issues[0]?.message ?? "Check the form");
    setBusy(true);
    try { await submit({ data: parsed.data }); form.reset(); setSent(true); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Could not send your enquiry"); }
    finally { setBusy(false); }
  }
  if (sent) return <div className="mt-8 rounded-3xl bg-muted p-7"><h2 className="text-xl font-semibold">Thank you — your enquiry was sent.</h2><p className="mt-2 text-muted-foreground">Our team will get back to you within one business day.</p><Button variant="outline" className="mt-4 rounded-full" onClick={() => setSent(false)}>Send another enquiry</Button></div>;
  return <form className="mt-8 grid gap-4 rounded-3xl bg-muted p-5 md:p-7">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1.5 text-xs font-medium">First name<input name="first" type="text" required className={field} /></label><label className="grid gap-1.5 text-xs font-medium">Last name<input name="last" type="text" required className={field} /></label><label className="grid gap-1.5 text-xs font-medium">Email<input name="email" type="email" required className={field} /></label><label className="grid gap-1.5 text-xs font-medium">Phone<input name="phone" type="tel" required className={field} /></label>
            <label className="grid gap-1.5 text-xs font-medium">City / town<input name="city" type="text" required className={field} /></label>
            <label className="grid gap-1.5 text-xs font-medium">Premises<select name="premises" className={field} defaultValue=""><option value="" disabled>Select...</option><option>Residential</option><option>Commercial</option><option>Mixed use</option><option>Industrial</option></select></label>
            <label className="grid gap-1.5 text-xs font-medium">Property type<select name="propertyType" className={field} defaultValue=""><option value="" disabled>Select...</option><option>Apartment block</option><option>Single house</option><option>Estate / gated community</option><option>Office / shops</option><option>Other</option></select></label>
            <label className="grid gap-1.5 text-xs font-medium">Current main meter<select name="mainMeter" className={field} defaultValue=""><option value="" disabled>Select...</option><option>Prepaid</option><option>Postpaid</option><option>None</option><option>Not sure</option></select></label>
          </div>
          <fieldset className="grid gap-2"><legend className="mb-2 text-xs font-medium">Meters needed</legend>
            <div className="flex flex-wrap gap-4 text-sm">{["Electricity","Water","Gas"].map(m => <label key={m} className="flex items-center gap-2"><input type="checkbox" name="meters" value={m} className="h-4 w-4 accent-primary" />{m}</label>)}</div>
          </fieldset>
          <label className="grid gap-1.5 text-xs font-medium">Message<textarea name="message" rows={4} placeholder="How many units? Any timelines?" className={field + " h-auto py-3"} /></label>
          <div><Button type="submit" disabled={busy} className="h-11 rounded-full px-6 font-semibold">{busy ? "Sending…" : "Send enquiry"} <ArrowRight className="h-4 w-4" /></Button></div>
        </form>;
}
