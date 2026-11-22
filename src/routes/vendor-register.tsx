import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2, Store, Building2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { vendorRegistrationSchema } from "@/lib/vendor-registration";
import { submitVendorRegistration } from "@/lib/vendor-registration.functions";
import logo from "@/assets/smatrapay-logo.png.asset.json";
import bgAsset from "@/assets/smatrapay-bg.webp.asset.json";

export const Route = createFileRoute("/vendor-register")({
  head: () => ({
    meta: [
      { title: "Vendor Registration · SmatraPay" },
      {
        name: "description",
        content:
          "Apply to become a SmatraPay metering vendor. Submit your business and contact details for administrator review.",
      },
      { property: "og:title", content: "Vendor Registration · SmatraPay" },
      {
        property: "og:description",
        content: "Submit a private vendor application for SmatraPay administrator review.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VendorRegister,
});
const steps = ["Business", "Contact", "Services", "Review"];
const groups = [
  ["business_name", "business_type", "registration_number", "location"],
  ["contact_name", "email", "phone"],
  ["services", "description", "contact_preference"],
];
const initial = {
  business_name: "",
  business_type: "",
  registration_number: "",
  contact_name: "",
  email: "",
  phone: "",
  location: "",
  services: [] as string[],
  description: "",
  contact_preference: "Email",
  consent: false,
};
function VendorRegister() {
  const submit = useServerFn(submitVendorRegistration);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof typeof initial, string>>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const key = useRef<string | null>(null);
  const [result, setResult] = useState<{ reference: string; status: string } | null>(null);
  const field = (name: keyof typeof initial, value: string | boolean | string[]) => {
    setForm((p) => ({ ...p, [name]: value }));
    setErrors((p) => ({ ...p, [name]: "" }));
    setError("");
  };
  const validate = (all: boolean) => {
    const input = { ...form, submission_key: key.current ?? crypto.randomUUID() };
    try {
      const parsed = vendorRegistrationSchema.safeParse(input);
      if (parsed.success) {
        setErrors({});
        return parsed.data;
      }
      const relevant = parsed.error.issues.filter(
        (i) => all || groups[step]?.includes(String(i.path[0])),
      );
      setErrors(Object.fromEntries(relevant.map((i) => [String(i.path[0]), i.message])));
      if (!relevant.length) return true;
    } catch (e) {
      setErrors({ phone: e instanceof Error ? e.message : "Check your phone number" });
    }
    return false;
  };
  const next = () => {
    if (validate(false)) {
      setStep((s) => s + 1);
      setError("");
    }
  };
  async function send() {
    if (lock.current) return;
    key.current ??= crypto.randomUUID();
    const data = validate(true);
    if (!data || data === true) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      setResult(await submit({ data }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit. Please try again.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const input = (
    name: keyof typeof initial,
    label: string,
    max: number,
    type = "text",
    optional = false,
  ) => (
    <div className="space-y-2">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
        {!optional && <span className="text-destructive"> *</span>}
      </label>
      <input
        id={name}
        type={type}
        value={String(form[name])}
        maxLength={max}
        onChange={(e) => field(name, e.target.value)}
        autoComplete={name === "email" ? "email" : name === "phone" ? "tel" : undefined}
        className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-invalid={Boolean(errors[name])}
        aria-describedby={errors[name] ? `${name}-error` : undefined}
      />
      {errors[name] && (
        <p id={`${name}-error`} className="text-sm text-destructive">
          {errors[name]}
        </p>
      )}
    </div>
  );
  return (
    <div className="relative flex min-h-screen flex-col bg-muted/40 text-foreground">
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${bgAsset.url})` }} />
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-background/60 dark:bg-background/88" />
      <div aria-hidden className="brand-wash pointer-events-none fixed inset-0" />
      <header className="relative border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <Link to="/" aria-label="SmatraPay home">
            <img src={logo.url} alt="SmatraPay" className="h-8 w-auto max-w-40" />
          </Link>
          <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-2 text-sm sm:gap-3">
            <Link to="/" className="hidden text-muted-foreground hover:text-foreground sm:block">Home</Link>
            <Button asChild className="px-3 text-xs sm:px-5 sm:text-sm"><Link to="/mytokens">Token Checker</Link></Button><Button asChild className="px-3 text-xs sm:px-5 sm:text-sm"><Link to="/vendor-register">Become a Vendor</Link></Button>
            <Button asChild variant="outline" size="sm"><Link to="/login">Sign In</Link></Button>
          </nav>
        </div>
      </header>
      <main className="relative mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:py-12">
        <div className="overflow-hidden rounded-lg border border-border bg-card">
        {result ? (
          <section aria-live="polite" className="space-y-5 px-6 py-10">
            <CheckCircle2 className="size-12 text-accent" />
            <h1 className="text-3xl font-bold">Application received</h1>
            <p className="text-lg font-semibold">{result.reference}</p>
            <p>
              Status: <strong>{result.status}</strong>
            </p>
            <p className="text-muted-foreground">
              Your application is awaiting administrator review. No vendor account has been created.
              If accepted, account setup instructions will be sent to your registered email and
              phone.
            </p>
            <Button asChild variant="outline">
              <Link to="/">Return to homepage</Link>
            </Button>
          </section>
        ) : (
          <>
            <div className="border-b border-border px-5 py-6 sm:px-7">
              <div className="flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Store className="size-6" /></div>
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold">Become a SmatraPay Vendor</h1>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Apply to offer prepaid metering services with SmatraPay. Fields marked <span className="text-destructive">*</span> are required.</p>
                </div>
              </div>
              <ol className="mt-7 grid grid-cols-4 gap-2" aria-label="Registration progress">
                {steps.map((s, i) => (
                  <li key={s} aria-current={step === i ? "step" : undefined} className={`min-w-0 border-b-2 pb-3 ${step === i ? "border-primary" : "border-transparent"}`}>
                    <span className={`flex flex-col items-center gap-2 text-xs sm:flex-row ${step === i ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                      <span className={`flex size-6 shrink-0 items-center justify-center rounded-full ${i <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                        {i < step ? <Check className="size-3" /> : i + 1}
                      </span>
                      {s}
                    </span>
                  </li>
                ))}
              </ol>
              <div className="mt-4 flex items-center gap-3">
                <div role="progressbar" aria-label="Completed registration steps" aria-valuenow={step} aria-valuemin={0} aria-valuemax={4} className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full bg-primary transition-all motion-reduce:transition-none ${["w-0", "w-1/4", "w-1/2", "w-3/4"][step]}`} />
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{step} of 4 complete</span>
              </div>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (step < 3) next();
                else void send();
              }}
              noValidate
              className="pt-6"
            >
              <h2 className="mb-6 flex items-center gap-2 px-5 text-base font-semibold sm:px-7">
                <Building2 className="size-4 text-primary" />
                {
                  [
                    "Business information",
                    "Contact & location",
                    "Services & preferences",
                    "Review your application",
                  ][step]
                }
              </h2>
              <div className="grid gap-5 px-5 sm:grid-cols-2 sm:px-7">
                {step === 0 && (
                  <>
                    <fieldset className="space-y-2 sm:col-span-2">
                      <legend className="mb-2 text-sm font-medium">I am registering as <span className="text-destructive">*</span></legend>
                      <div className="flex flex-wrap gap-2">
                        {[{ value: "Sole proprietor", label: "An individual", icon: UserRound }, { value: "Company", label: "A company", icon: Building2 }, { value: "Partnership", label: "A partnership", icon: Building2 }, { value: "Other", label: "Other", icon: Store }].map((option) => (
                          <Button key={option.value} type="button" size="sm" variant={form.business_type === option.value ? "default" : "outline"} aria-pressed={form.business_type === option.value} onClick={() => field("business_type", option.value)}>
                            <option.icon className="size-4" />{option.label}
                          </Button>
                        ))}
                      </div>
                      {errors.business_type && <p role="alert" className="text-sm text-destructive">Select a business type</p>}
                    </fieldset>
                    <div className="sm:col-span-2">{input("business_name", "Business / trading name", 120)}</div>
                    <div className="space-y-2 sm:col-span-2">
                      <label htmlFor="location" className="text-sm font-medium">Physical address <span className="text-destructive">*</span></label>
                      <textarea id="location" rows={3} maxLength={500} value={form.location} onChange={(e) => field("location", e.target.value)} aria-invalid={Boolean(errors.location)} aria-describedby={errors.location ? "location-error" : undefined} className="w-full rounded-md border border-input bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                      {errors.location && <p id="location-error" className="text-sm text-destructive">{errors.location}</p>}
                    </div>
                    {input(
                      "registration_number",
                      "Business registration number (optional)",
                      100,
                      "text",
                      true,
                    )}
                  </>
                )}
                {step === 1 && (
                  <>
                    {input("contact_name", "Contact person", 120)}
                    {input("email", "Registered email", 254, "email")}
                    {input("phone", "Registered Kenyan mobile number", 30, "tel")}
                  </>
                )}
                {step === 2 && (
                  <>
                    <fieldset className="space-y-3">
                      <legend className="mb-3 text-sm font-medium">Services offered *</legend>
                      {["Electricity", "Water", "Gas"].map((v) => (
                        <label key={v} className="flex items-center gap-3 text-sm">
                          <input
                            type="checkbox"
                            checked={form.services.includes(v)}
                            onChange={(e) =>
                              field(
                                "services",
                                e.target.checked
                                  ? [...form.services, v]
                                  : form.services.filter((s) => s !== v),
                              )
                            }
                            className="size-4 accent-primary"
                          />
                          {v}
                        </label>
                      ))}
                      {errors.services && (
                        <p className="text-sm text-destructive">{errors.services}</p>
                      )}
                    </fieldset>
                    <div className="space-y-2">
                      <label htmlFor="contact_preference" className="text-sm font-medium">
                        Preferred contact method *
                      </label>
                      <select
                        id="contact_preference"
                        value={form.contact_preference}
                        onChange={(e) => field("contact_preference", e.target.value)}
                        className="h-11 w-full rounded-md border border-input bg-background px-3"
                      >
                        <option>Email</option>
                        <option>Phone</option>
                      </select>
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <label htmlFor="description" className="text-sm font-medium">
                        About your business (optional)
                      </label>
                      <textarea
                        id="description"
                        rows={4}
                        maxLength={1000}
                        value={form.description}
                        onChange={(e) => field("description", e.target.value)}
                        className="w-full rounded-md border border-input bg-background p-3"
                      />
                    </div>
                  </>
                )}
                {step === 3 && (
                  <>
                    <dl className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
                      {Object.entries(form)
                        .filter(([k]) => k !== "consent")
                        .map(([k, v]) => (
                          <div key={k} className="min-w-0 border-b border-border pb-3">
                            <dt className="text-xs capitalize text-muted-foreground">
                              {k.replaceAll("_", " ")}
                            </dt>
                            <dd className="mt-1 break-words text-sm font-medium">
                              {Array.isArray(v) ? v.join(", ") : String(v) || "Not provided"}
                            </dd>
                          </div>
                        ))}
                    </dl>
                    <div className="sm:col-span-2">
                      <label className="flex items-start gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={form.consent}
                          onChange={(e) => field("consent", e.target.checked)}
                          className="mt-1 size-4 shrink-0 accent-primary"
                        />
                        <span>
                          I confirm these details are accurate and authorize SmatraPay to review
                          this application and contact me about its outcome.
                        </span>
                      </label>
                      {errors.consent && (
                        <p className="mt-2 text-sm text-destructive">{errors.consent}</p>
                      )}
                    </div>
                  </>
                )}
              </div>
              {error && (
                <p role="alert" className="mt-5 px-5 text-sm text-destructive sm:px-7">
                  {error}
                </p>
              )}
              <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-border bg-muted/20 px-5 py-5 sm:px-7">
                <p className="text-xs text-muted-foreground">Already registered? <Link to="/login" className="font-medium text-primary underline underline-offset-2">Sign In</Link></p>
                <div className="ml-auto flex gap-2">
                {step === 0 ? (
                  <Button asChild variant="outline"><Link to="/">Cancel</Link></Button>
                ) : (
                  <Button type="button" variant="outline" disabled={busy} onClick={() => { setStep((s) => s - 1); setErrors({}); }}><ArrowLeft className="size-4" />Back</Button>
                )}
                <Button type="submit" disabled={busy}>
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : step === 3 ? (
                    <Check className="size-4" />
                  ) : (
                    <ArrowRight className="size-4" />
                  )}
                  {step === 3 ? (busy ? "Submitting…" : "Submit application") : "Continue"}
                </Button>
                </div>
              </div>
            </form>
          </>
        )}
        </div>
      </main>
      <footer className="relative bg-brand-panel text-panel-foreground">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:grid-cols-3">
          <div><Link to="/" aria-label="SmatraPay home"><img src={logo.url} alt="SmatraPay" className="h-8 w-auto max-w-48" /></Link><p className="mt-4 max-w-xs text-sm leading-relaxed text-panel-muted">Prepaid metering, digital payments and utility management for property owners, businesses and residents.</p></div>
          <div><h2 className="text-xs font-semibold uppercase text-accent">Quick links</h2><div className="mt-4 flex flex-col items-start gap-3 text-sm text-panel-muted"><Link to="/">Home</Link><Link to="/mytokens">Token Checker</Link></div></div>
          <div><h2 className="text-xs font-semibold uppercase text-accent">Your account</h2><div className="mt-4 flex flex-col items-start gap-3 text-sm text-panel-muted"><Link to="/login">Sign In</Link><Link to="/vendor-register">Become a Vendor</Link></div></div>
        </div>
      </footer>
    </div>
  );
}
