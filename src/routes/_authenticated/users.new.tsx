import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, AtSign, Phone, Save, X } from "lucide-react";
import { toast } from "sonner";

import { createUser } from "@/lib/users.functions";
import { createUserSchema, fieldErrors } from "@/lib/user-schema";
import { PortalLayout } from "@/components/PortalLayout";

export const Route = createFileRoute("/_authenticated/users/new")({
  head: () => ({
    meta: [
      { title: "Add New User · SmatraPay" },
      {
        name: "description",
        content: "Onboard a new SmatraPay user with role, contact details and account status.",
      },
      { property: "og:title", content: "Add New User · SmatraPay" },
      {
        property: "og:description",
        content: "Onboard a new SmatraPay user with role, contact details and account status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewUserPage,
});

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "landlord", label: "Landlord" },
  { value: "vendor", label: "Vendor" },
  { value: "agent", label: "Agent" },
  { value: "service_provider", label: "Service Provider" },
  { value: "resident", label: "Resident" },
  { value: "moderator", label: "Moderator" },
  { value: "user", label: "User" },
] as const;

const STATUSES = [
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "inactive", label: "Inactive" },
  { value: "suspended", label: "Suspended" },
] as const;

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary";

function NewUserPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const create = useServerFn(createUser);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    username: "",
    phone: "",
    bio: "",
    notes: "",
    role: "user",
    status: "active",
  });

  const set = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const mutation = useMutation({
    mutationFn: (data: typeof form) => create({ data } as never),
    onSuccess: async () => {
      toast.success("User created");
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      navigate({ to: "/users", search: { page: 1, limit: 10 } });
    },
    onError: (error: Error) => {
      const message = error.message || "Could not create user";
      if (/already been registered|already exists|duplicate/i.test(message)) {
        setErrors((prev) => ({ ...prev, email: "This email is already registered" }));
      }
      toast.error(message);
    },
  });

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = createUserSchema.safeParse(form);
    if (!parsed.success) {
      const issues = fieldErrors(parsed.error);
      setErrors(issues);
      toast.error("Please fix the highlighted fields");
      return;
    }
    setErrors({});
    mutation.mutate(form);
  };

  return (
    <PortalLayout roles={["admin"]} title="User Management" description="Add a new user">
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Link
              to="/users"
              search={{ page: 1, limit: 10 }}
              aria-label="Back to user management"
              className="mt-1 inline-flex size-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-accent/10"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Add New User</h1>
              <p className="text-sm text-muted-foreground">Onboard a new platform member</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/users"
              search={{ page: 1, limit: 10 }}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10"
            >
              <X className="size-4" /> Cancel
            </Link>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              <Save className="size-4" />
              {mutation.isPending ? "Saving…" : "Save User"}
            </button>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <section className="rounded-2xl border border-border bg-card">
              <header className="border-b border-border px-5 py-4">
                <h2 className="text-base font-semibold text-foreground">Personal Information</h2>
              </header>
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <Field label="Full Name" required error={errors["name"]}>
                  <input
                    className={inputClass}
                    placeholder="e.g. Aisha Malik"
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </Field>
                <Field label="Email" required error={errors["email"]}>
                  <div className="flex items-stretch overflow-hidden rounded-lg border border-border focus-within:border-primary">
                    <span className="flex items-center bg-muted/50 px-3 text-muted-foreground">
                      <AtSign className="size-4" />
                    </span>
                    <input
                      type="email"
                      className="w-full bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/70"
                      placeholder="name@smatrapay.com"
                      value={form.email}
                      onChange={(e) => set("email", e.target.value)}
                    />
                  </div>
                </Field>
                <Field label="Phone" error={errors["phone"]}>
                  <div className="flex items-stretch overflow-hidden rounded-lg border border-border focus-within:border-primary">
                    <span className="flex items-center bg-muted/50 px-3 text-muted-foreground">
                      <Phone className="size-4" />
                    </span>
                    <input
                      className="w-full bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/70"
                      placeholder="+254 700 000 000"
                      value={form.phone}
                      onChange={(e) => set("phone", e.target.value)}
                    />
                  </div>
                </Field>
                <Field label="Username" error={errors["username"]}>
                  <input
                    className={inputClass}
                    placeholder="e.g. aisha.malik"
                    value={form.username}
                    onChange={(e) => set("username", e.target.value)}
                  />
                </Field>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card">
              <header className="border-b border-border px-5 py-4">
                <h2 className="text-base font-semibold text-foreground">Account Details</h2>
              </header>
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <Field label="Role" required error={errors["role"]}>
                  <select
                    className={inputClass}
                    value={form.role}
                    onChange={(e) => set("role", e.target.value)}
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Temporary Password" required error={errors["password"]}>
                  <input
                    type="password"
                    className={inputClass}
                    placeholder="Min 8 chars, letters and numbers"
                    value={form.password}
                    onChange={(e) => set("password", e.target.value)}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Bio" error={errors["bio"]}>
                    <textarea
                      rows={3}
                      className={inputClass}
                      placeholder="Short description of this user"
                      value={form.bio}
                      onChange={(e) => set("bio", e.target.value)}
                    />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Internal Notes" error={errors["notes"]}>
                    <textarea
                      rows={3}
                      className={inputClass}
                      placeholder="Visible to administrators only"
                      value={form.notes}
                      onChange={(e) => set("notes", e.target.value)}
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
                  className={inputClass}
                  value={form.status}
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
                The account is confirmed automatically. Ask the user to change their temporary
                password after the first sign-in.
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
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </span>
      <div className={error ? "[&_input]:border-destructive [&_select]:border-destructive [&_textarea]:border-destructive [&>div]:border-destructive" : undefined}>
        {children}
      </div>
      {error && (
        <span role="alert" className="block text-xs font-medium text-destructive">
          {error}
        </span>
      )}
    </label>
  );
}
