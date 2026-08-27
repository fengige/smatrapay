import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useId, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  AtSign,
  Check,
  Loader2,
  Phone,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { createUser } from "@/lib/users.functions";
import { createUserSchema, fieldErrors } from "@/lib/user-schema";
import { PortalLayout } from "@/components/PortalLayout";

export const Route = createFileRoute("/_authenticated/landlords/new")({
  head: () => ({
    meta: [
      { title: "Add New Landlord · SmatraPay" },
      {
        name: "description",
        content: "Onboard a new SmatraPay landlord with contact details and account status.",
      },
      { property: "og:title", content: "Add New Landlord · SmatraPay" },
      {
        property: "og:description",
        content: "Onboard a new SmatraPay landlord with contact details and account status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewLandlordPage,
});

const STATUSES = [
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "inactive", label: "Inactive" },
  { value: "suspended", label: "Suspended" },
] as const;

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary disabled:cursor-not-allowed disabled:bg-muted/30 disabled:opacity-60";

function NewLandlordPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const create = useServerFn(createUser);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    username: "",
    phone: "",
    bio: "",
    notes: "",
    role: "landlord",
    status: "active",
  });


  const validateField = (key: keyof typeof form) => {
    const partial = createUserSchema.safeParse({ ...form, [key]: form[key] });
    if (!partial.success) {
      const issues = fieldErrors(partial.error);
      if (issues[key]) {
        setErrors((prev) => ({ ...prev, [key]: issues[key] } as Record<string, string>));
        return;
      }
    }
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next as Record<string, string>;
    });
  };

  const set = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (touched[key]) {
      // Defer validation until after state update.
      setTimeout(() => validateField(key), 0);
    }
  };

  const blur = (key: keyof typeof form) => {
    setTouched((prev) => ({ ...prev, [key]: true }));
    validateField(key);
  };

  const mutation = useMutation({
    mutationFn: (data: typeof form) => create({ data } as never),
    onSuccess: async () => {
      toast.success("Landlord created successfully");
      await queryClient.invalidateQueries({ queryKey: ["users", "landlord"] });
      navigate({ to: "/landlords", search: { page: 1, limit: 10 } });
    },
    onError: (error: Error) => {
      const message = error.message || "Could not create landlord";
      if (/already been registered|already exists|duplicate/i.test(message)) {
        setErrors((prev) => ({ ...prev, email: "This email is already registered" }));
        setTouched((prev) => ({ ...prev, email: true }));
      }
      toast.error(message);
    },
  });

  const isSaving = mutation.isPending;

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    // Mark all fields as touched so every error surfaces.
    const allTouched: Record<string, boolean> = {};
    for (const key of Object.keys(form)) allTouched[key] = true;
    setTouched(allTouched);

    const parsed = createUserSchema.safeParse(form);
    if (!parsed.success) {
      const issues = fieldErrors(parsed.error);
      setErrors(issues);
      toast.error("Please fix the highlighted fields before saving");
      return;
    }
    setErrors({});
    mutation.mutate(form);
  };

  const hasErrors = Object.keys(errors).length > 0;
  const passwordChecks = {
    length: form.password.length >= 8,
    letter: /[A-Za-z]/.test(form.password),
    number: /[0-9]/.test(form.password),
  };

  return (
    <PortalLayout roles={["admin"]} title="Landlord Management" description="Add a new landlord">
      <form onSubmit={onSubmit} className="space-y-5" aria-busy={isSaving}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Link
              to="/landlords"
              search={{ page: 1, limit: 10 }}
              aria-label="Back to landlord management"
              className="mt-1 inline-flex size-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-accent/10"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Add New Landlord</h1>
              <p className="text-sm text-muted-foreground">Onboard a new landlord account</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/landlords"
              search={{ page: 1, limit: 10 }}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10"
            >
              <X className="size-4" /> Cancel
            </Link>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              {isSaving ? "Adding Landlord…" : "Add Landlord"}
            </button>
          </div>
        </div>

        {hasErrors && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-semibold">There are errors in the form</p>
              <p className="text-destructive/80">
                Please review the highlighted fields below and try again.
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <section className="rounded-2xl border border-border bg-card">
              <header className="border-b border-border px-5 py-4">
                <h2 className="text-base font-semibold text-foreground">Personal Information</h2>
              </header>
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <Field label="Full Name" required error={errors["name"]} hint="First and last name as it will appear across the portal.">
                  <input
                    id="landlord-name"
                    className={inputClass}
                    placeholder="e.g. Aisha Malik"
                    value={form.name}
                    disabled={isSaving}
                    aria-invalid={!!errors["name"]}
                    aria-describedby={errors["name"] ? "landlord-name-error" : undefined}
                    onChange={(e) => set("name", e.target.value)}
                    onBlur={() => blur("name")}
                  />
                </Field>
                <Field label="Email" required error={errors["email"]} hint="Used for sign-in and password reset notifications.">
                  <div
                    className={`flex items-stretch overflow-hidden rounded-lg border focus-within:border-primary ${
                      errors["email"] ? "border-destructive" : "border-border"
                    }`}
                  >
                    <span className="flex items-center bg-muted/50 px-3 text-muted-foreground">
                      <AtSign className="size-4" />
                    </span>
                    <input
                      id="landlord-email"
                      type="email"
                      className="w-full bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed disabled:bg-muted/30 disabled:opacity-60"
                      placeholder="name@smatrapay.com"
                      value={form.email}
                      disabled={isSaving}
                      aria-invalid={!!errors["email"]}
                      aria-describedby={errors["email"] ? "landlord-email-error" : undefined}
                      onChange={(e) => set("email", e.target.value)}
                      onBlur={() => blur("email")}
                    />
                  </div>
                </Field>
                <Field label="Phone" error={errors["phone"]} hint="Include country code, e.g. +254 700 000 000.">
                  <div
                    className={`flex items-stretch overflow-hidden rounded-lg border focus-within:border-primary ${
                      errors["phone"] ? "border-destructive" : "border-border"
                    }`}
                  >
                    <span className="flex items-center bg-muted/50 px-3 text-muted-foreground">
                      <Phone className="size-4" />
                    </span>
                    <input
                      id="landlord-phone"
                      className="w-full bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed disabled:bg-muted/30 disabled:opacity-60"
                      placeholder="+254 700 000 000"
                      value={form.phone}
                      disabled={isSaving}
                      aria-invalid={!!errors["phone"]}
                      aria-describedby={errors["phone"] ? "landlord-phone-error" : undefined}
                      onChange={(e) => set("phone", e.target.value)}
                      onBlur={() => blur("phone")}
                    />
                  </div>
                </Field>
                <Field label="Username" error={errors["username"]} hint="Optional. Letters, numbers, dots, dashes and underscores only.">
                  <input
                    id="landlord-username"
                    className={inputClass}
                    placeholder="e.g. aisha.malik"
                    value={form.username}
                    disabled={isSaving}
                    aria-invalid={!!errors["username"]}
                    aria-describedby={errors["username"] ? "landlord-username-error" : undefined}
                    onChange={(e) => set("username", e.target.value)}
                    onBlur={() => blur("username")}
                  />
                </Field>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card">
              <header className="border-b border-border px-5 py-4">
                <h2 className="text-base font-semibold text-foreground">Residency Details</h2>
              </header>
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <Field label="Property" error={errors["property"]} hint="Estate or property the landlord belongs to.">
                  <input
                    className={inputClass}
                    placeholder="e.g. Riverside Gardens"
                    value={form.property}
                    disabled={isSaving}
                    aria-invalid={!!errors["property"]}
                    onChange={(e) => set("property", e.target.value)}
                    onBlur={() => blur("property")}
                  />
                </Field>
                <Field label="Building" error={errors["building"]} hint="Optional block or building name.">
                  <input
                    className={inputClass}
                    placeholder="e.g. Block B"
                    value={form.building}
                    disabled={isSaving}
                    aria-invalid={!!errors["building"]}
                    onChange={(e) => set("building", e.target.value)}
                    onBlur={() => blur("building")}
                  />
                </Field>
                <Field label="Unit / House Number" error={errors["unit_number"]}>
                  <input
                    className={inputClass}
                    placeholder="e.g. B-204"
                    value={form.unit_number}
                    disabled={isSaving}
                    aria-invalid={!!errors["unit_number"]}
                    onChange={(e) => set("unit_number", e.target.value)}
                    onBlur={() => blur("unit_number")}
                  />
                </Field>
                <Field label="Move-in Date" error={errors["move_in_date"]}>
                  <input
                    type="date"
                    className={inputClass}
                    value={form.move_in_date}
                    disabled={isSaving}
                    aria-invalid={!!errors["move_in_date"]}
                    onChange={(e) => set("move_in_date", e.target.value)}
                    onBlur={() => blur("move_in_date")}
                  />
                </Field>
              </div>
            </section>



            <section className="rounded-2xl border border-border bg-card">
              <header className="border-b border-border px-5 py-4">
                <h2 className="text-base font-semibold text-foreground">Account Details</h2>
              </header>
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <Field label="Temporary Password" required error={errors["password"]}>
                  <input
                    id="landlord-password"
                    type="password"
                    className={inputClass}
                    placeholder="Min 8 chars, letters and numbers"
                    value={form.password}
                    disabled={isSaving}
                    aria-invalid={!!errors["password"]}
                    aria-describedby={errors["password"] ? "landlord-password-error" : "password-hint"}
                    onChange={(e) => set("password", e.target.value)}
                    onBlur={() => blur("password")}
                  />
                  <div id="password-hint" className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <PasswordCheck ok={passwordChecks.length}>At least 8 characters</PasswordCheck>
                    <PasswordCheck ok={passwordChecks.letter}>One letter</PasswordCheck>
                    <PasswordCheck ok={passwordChecks.number}>One number</PasswordCheck>
                  </div>
                </Field>
                <Field label="Role" required>
                  <input
                    disabled
                    value="Landlord"
                    className="w-full cursor-not-allowed rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground outline-none"
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Bio" error={errors["bio"]} hint="A short description visible to staff and landlords.">
                    <textarea
                      id="landlord-bio"
                      rows={3}
                      className={inputClass}
                      placeholder="Short description of this landlord"
                      value={form.bio}
                      disabled={isSaving}
                      aria-invalid={!!errors["bio"]}
                      aria-describedby={errors["bio"] ? "landlord-bio-error" : undefined}
                      onChange={(e) => set("bio", e.target.value)}
                      onBlur={() => blur("bio")}
                    />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Internal Notes" error={errors["notes"]} hint="Visible to administrators only.">
                    <textarea
                      id="landlord-notes"
                      rows={3}
                      className={inputClass}
                      placeholder="Visible to administrators only"
                      value={form.notes}
                      disabled={isSaving}
                      aria-invalid={!!errors["notes"]}
                      aria-describedby={errors["notes"] ? "landlord-notes-error" : undefined}
                      onChange={(e) => set("notes", e.target.value)}
                      onBlur={() => blur("notes")}
                    />
                  </Field>
                </div>
              </div>
            </section>
          </div>

          <section className="h-fit rounded-2xl border border-border bg-card">
            <header className="border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold text-foreground">Status</h2>
            </header>
            <div className="p-5">
              <Field label="Account Status" error={errors["status"]}>
                <select
                  id="landlord-status"
                  className={inputClass}
                  value={form.status}
                  disabled={isSaving}
                  aria-invalid={!!errors["status"]}
                  aria-describedby={errors["status"] ? "landlord-status-error" : undefined}
                  onChange={(e) => set("status", e.target.value)}
                >
                  {STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="mt-3 text-xs text-muted-foreground">
                The landlord account is confirmed automatically. Ask the landlord to change their
                temporary password after the first sign-in.
              </p>
            </div>
          </section>
        </div>
      </form>
    </PortalLayout>
  );
}

function Field({
  label,
  required,
  error,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  required?: boolean;
  error?: string | undefined;
  hint?: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  const errorId = useId();
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive" aria-hidden="true">*</span>}
      </span>
      {children}
      {hint && !error && (
        <span className="block text-xs text-muted-foreground/80">{hint}</span>
      )}
      {error && (
        <span role="alert" className="flex items-start gap-1 text-xs font-medium text-destructive">
          <AlertCircle className="mt-0.5 size-3 shrink-0" />
          <span id={errorId}>{error}</span>
        </span>
      )}
    </label>
  );
}

function PasswordCheck({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
        ok ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"
      }`}
    >
      {ok ? <Check className="size-3" /> : <span className="size-3 rounded-full border border-current" />}
      {children}
    </span>
  );
}
