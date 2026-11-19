import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { vendorRegistrationSchema } from "@/lib/vendor-registration";
import { submitVendorRegistration } from "@/lib/vendor-registration.functions";
import logo from "@/assets/smatrapay-logo.png.asset.json";

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
  ["business_name", "business_type", "registration_number"],
  ["contact_name", "email", "phone", "location"],
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
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
          <Link to="/" aria-label="SmatraPay home">
            <img src={logo.url} alt="SmatraPay" className="h-8 w-auto max-w-40" />
          </Link>
          <Button asChild variant="outline">
            <Link to="/login">Log in</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        {result ? (
          <section aria-live="polite" className="space-y-5 py-10">
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
            <p className="mb-3 text-sm font-semibold text-accent">SmatraPay partners</p>
            <h1 className="text-3xl font-bold sm:text-4xl">Become a Vendor</h1>
            <p className="mt-3 max-w-xl text-muted-foreground">
              Tell us about your business. Applications are reviewed before any vendor account is
              opened.
            </p>
            <ol className="my-9 grid grid-cols-4 gap-2" aria-label="Registration progress">
              {steps.map((s, i) => (
                <li key={s} aria-current={step === i ? "step" : undefined} className="min-w-0">
                  <div
                    className={`mb-2 h-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`}
                  />
                  <span
                    className={`flex items-center gap-1 text-xs sm:text-sm ${step === i ? "font-semibold text-primary" : "text-muted-foreground"}`}
                  >
                    {i < step ? <Check className="size-3 shrink-0" /> : `${i + 1}.`} {s}
                  </span>
                </li>
              ))}
            </ol>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (step < 3) next();
                else void send();
              }}
              noValidate
              className="border-t border-border pt-7"
            >
              <h2 className="mb-6 text-xl font-semibold">
                {
                  [
                    "Business information",
                    "Contact & location",
                    "Services & preferences",
                    "Review your application",
                  ][step]
                }
              </h2>
              <div className="grid gap-5 sm:grid-cols-2">
                {step === 0 && (
                  <>
                    {input("business_name", "Business / company name", 120)}
                    <div className="space-y-2">
                      <label htmlFor="business_type" className="text-sm font-medium">
                        Business type *
                      </label>
                      <select
                        id="business_type"
                        value={form.business_type}
                        onChange={(e) => field("business_type", e.target.value)}
                        className="h-11 w-full rounded-md border border-input bg-background px-3"
                      >
                        <option value="">Select business type</option>
                        {["Company", "Sole proprietor", "Partnership", "Other"].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                      {errors.business_type && (
                        <p className="text-sm text-destructive">Select a business type</p>
                      )}
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
                    {input("location", "Business location / address", 500)}
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
                <p role="alert" className="mt-5 text-sm text-destructive">
                  {error}
                </p>
              )}
              <div className="mt-8 flex justify-between border-t border-border pt-6">
                <Button
                  type="button"
                  variant="outline"
                  disabled={step === 0 || busy}
                  onClick={() => {
                    setStep((s) => s - 1);
                    setErrors({});
                  }}
                >
                  <ArrowLeft className="size-4" />
                  Back
                </Button>
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
            </form>
          </>
        )}
      </main>
    </div>
  );
}
