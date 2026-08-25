import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, AtSign, Phone, Save, X } from "lucide-react";
import { toast } from "sonner";

import { getUserById, updateUser } from "@/lib/users.functions";
import { PortalLayout } from "@/components/PortalLayout";

export const Route = createFileRoute("/_authenticated/users/$id/edit")({
  head: () => ({
    meta: [
      { title: "Edit User · SmatraPay" },
      {
        name: "description",
        content: "Update a SmatraPay account profile: contact details, role, status and notes.",
      },
      { property: "og:title", content: "Edit User · SmatraPay" },
      {
        property: "og:description",
        content: "Update a SmatraPay account profile: contact details, role, status and notes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EditUserPage,
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-destructive">{error.message}</div>
  ),
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

type FormState = {
  name: string;
  email: string;
  username: string;
  phone: string;
  profile_image: string;
  bio: string;
  notes: string;
  role: string;
  status: string;
};

const emptyForm: FormState = {
  name: "",
  email: "",
  username: "",
  phone: "",
  profile_image: "",
  bio: "",
  notes: "",
  role: "user",
  status: "active",
};

function EditUserPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchUser = useServerFn(getUserById);
  const save = useServerFn(updateUser);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ["user", id],
    queryFn: () => fetchUser({ data: { id } }),
  });

  useEffect(() => {
    if (!data?.user) return;
    const u = data.user;
    setForm({
      name: u.name ?? "",
      email: u.email ?? "",
      username: u.username ?? "",
      phone: u.phone ?? "",
      profile_image: u.profile_image ?? "",
      bio: u.bio ?? "",
      notes: u.notes ?? "",
      role: data.roles?.[0] ?? "user",
      status: u.status ?? "active",
    });
  }, [data]);

  const set = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          id,
          name: form.name.trim() || null,
          email: form.email.trim() || null,
          username: form.username.trim() || null,
          phone: form.phone.trim() || null,
          profile_image: form.profile_image.trim() || null,
          bio: form.bio.trim() || null,
          notes: form.notes.trim() || null,
          status: form.status,
          role: form.role,
        },
      } as never),
    onSuccess: async () => {
      toast.success("User updated");
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      await queryClient.invalidateQueries({ queryKey: ["user", id] });
      navigate({ to: "/users/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message || "Could not update user"),
  });

  const validate = () => {
    const next: Record<string, string> = {};
    if (form.name.trim().length < 2) next["name"] = "Full name must be at least 2 characters";
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim()))
      next["email"] = "Enter a valid email address";
    if (form.username.trim() && !/^[a-zA-Z0-9._-]+$/.test(form.username.trim()))
      next["username"] = "Only letters, numbers, dots, dashes and underscores";
    if (form.phone.trim() && !/^[+]?[0-9\s()-]+$/.test(form.phone.trim()))
      next["phone"] = "Enter a valid phone number";
    return next;
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const issues = validate();
    if (Object.keys(issues).length) {
      setErrors(issues);
      toast.error("Please fix the highlighted fields");
      return;
    }
    setErrors({});
    mutation.mutate();
  };

  return (
    <PortalLayout roles={["admin"]} title="User Management" description="Edit user profile">
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Link
              to="/users/$id"
              params={{ id }}
              aria-label="Back to user profile"
              className="mt-1 inline-flex size-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-accent/10"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Edit User</h1>
              <p className="text-sm text-muted-foreground">
                Update profile details, role and account status
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/users/$id"
              params={{ id }}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10"
            >
              <X className="size-4" /> Cancel
            </Link>
            <button
              type="submit"
              disabled={mutation.isPending || isLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              <Save className="size-4" />
              {mutation.isPending ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-sm text-muted-foreground">
            Loading profile…
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-sm text-destructive">
            {(error as Error).message}
          </div>
        ) : (
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
                      value={form.name}
                      onChange={(e) => set("name", e.target.value)}
                    />
                  </Field>
                  <Field label="Email" error={errors["email"]}>
                    <div className="flex items-stretch overflow-hidden rounded-lg border border-border focus-within:border-primary">
                      <span className="flex items-center bg-muted/50 px-3 text-muted-foreground">
                        <AtSign className="size-4" />
                      </span>
                      <input
                        type="email"
                        className="w-full bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/70"
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
                        value={form.phone}
                        onChange={(e) => set("phone", e.target.value)}
                      />
                    </div>
                  </Field>
                  <Field label="Username" error={errors["username"]}>
                    <input
                      className={inputClass}
                      value={form.username}
                      onChange={(e) => set("username", e.target.value)}
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Profile Image URL" error={errors["profile_image"]}>
                      <input
                        className={inputClass}
                        placeholder="https://…"
                        value={form.profile_image}
                        onChange={(e) => set("profile_image", e.target.value)}
                      />
                    </Field>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-card">
                <header className="border-b border-border px-5 py-4">
                  <h2 className="text-base font-semibold text-foreground">Account Details</h2>
                </header>
                <div className="grid gap-4 p-5 sm:grid-cols-2">
                  <Field label="Role" error={errors["role"]}>
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
                  <div className="sm:col-span-2">
                    <Field label="Bio" error={errors["bio"]}>
                      <textarea
                        rows={3}
                        className={inputClass}
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
                  Suspended or inactive accounts cannot sign in to any portal.
                </p>
              </div>
            </section>
          </div>
        )}
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
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </span>
      <div
        className={
          error
            ? "[&_input]:border-destructive [&_select]:border-destructive [&_textarea]:border-destructive [&>div]:border-destructive"
            : undefined
        }
      >
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
