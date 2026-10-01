import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, AtSign, Loader2, Phone, Save, X } from "lucide-react";
import { toast } from "sonner";

import { getUserById } from "@/lib/users.functions";
import { updateLandlord } from "@/lib/landlords.functions";
import { editUserSchema, fieldErrors } from "@/lib/user-schema";
import { PortalLayout } from "@/components/PortalLayout";

export const Route = createFileRoute("/_authenticated/landlords/$id/edit")({
  head: () => ({
    meta: [
      { title: "Edit Landlord · SmatraPay" },
      {
        name: "description",
        content: "Update landlord contact details and account status.",
      },
      { property: "og:title", content: "Edit Landlord · SmatraPay" },
      {
        property: "og:description",
        content: "Update landlord contact details and account status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EditLandlordPage,
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-destructive">{(error as Error).message}</div>
  ),
  notFoundComponent: () => <div className="p-10 text-sm text-muted-foreground">Landlord not found.</div>,
});

const STATUSES = [
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "inactive", label: "Inactive" },
  { value: "suspended", label: "Suspended" },
] as const;

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary disabled:cursor-not-allowed disabled:bg-muted/30 disabled:opacity-60";

const landlordSchema = editUserSchema.omit({ role: true });

type FormState = {
  name: string;
  email: string;
  username: string;
  phone: string;
  bio: string;
  notes: string;
  status: string;
};

const EMPTY: FormState = {
  name: "",
  email: "",
  username: "",
  phone: "",
  bio: "",
  notes: "",
  status: "active",
};

function EditLandlordPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchUser = useServerFn(getUserById);
  const save = useServerFn(updateLandlord);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["users", "detail", id],
    queryFn: () => fetchUser({ data: { id } }),
  });

  useEffect(() => {
    if (!data?.user) return;
    const u = data.user as Record<string, unknown>;
    setForm({
      name: (u["name"] as string) ?? "",
      email: (u["email"] as string) ?? "",
      username: (u["username"] as string) ?? "",
      phone: (u["phone"] as string) ?? "",
      bio: (u["bio"] as string) ?? "",
      notes: (u["notes"] as string) ?? "",
      status: (u["status"] as string) ?? "active",
    });
  }, [data]);

  const originalStatus = (data?.user as { status?: string } | undefined)?.status ?? "active";

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
          name: form.name,
          email: form.email,
          username: form.username || null,
          phone: form.phone || null,
          bio: form.bio || null,
          notes: form.notes || null,
          status: form.status,
        },
      } as never),
    onSuccess: async () => {
      toast.success("Landlord updated");
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      navigate({ to: "/landlords", search: { page: 1, limit: 10, status: "all", q: "" } });
    },
    onError: (err: Error) => toast.error(err.message || "Could not update landlord"),
  });

  const isSaving = mutation.isPending;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = landlordSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      toast.error("Please fix the highlighted fields before saving");
      return;
    }
    setErrors({});
    if (form.status !== originalStatus) {
      setConfirmOpen(true);
      return;
    }
    mutation.mutate();
  };

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <PortalLayout roles={["admin"]} title="Landlord Management" description="Edit landlord details">
      {isLoading ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Loading landlord…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-10 text-center text-sm text-destructive">
          {(error as Error).message}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5" aria-busy={isSaving}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <Link
                to="/landlords"
                search={{ page: 1, limit: 10, status: "all", q: "" }}
                aria-label="Back to landlord management"
                className="mt-1 inline-flex size-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-accent/10"
              >
                <ArrowLeft className="size-4" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">Edit Landlord</h1>
                <p className="text-sm text-muted-foreground">{form.email || form.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/landlords"
                search={{ page: 1, limit: 10, status: "all", q: "" }}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10"
              >
                <X className="size-4" /> Cancel
              </Link>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {isSaving ? "Saving…" : "Save Changes"}
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
                <p className="text-destructive/80">Please review the highlighted fields below.</p>
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
                  <Field label="Full Name" required error={errors["name"]}>
                    <input
                      className={inputClass}
                      value={form.name}
                      disabled={isSaving}
                      aria-invalid={!!errors["name"]}
                      onChange={(e) => set("name", e.target.value)}
                    />
                  </Field>
                  <Field label="Email" required error={errors["email"]}>
                    <div
                      className={`flex items-stretch overflow-hidden rounded-lg border focus-within:border-primary ${
                        errors["email"] ? "border-destructive" : "border-border"
                      }`}
                    >
                      <span className="flex items-center bg-muted/50 px-3 text-muted-foreground">
                        <AtSign className="size-4" />
                      </span>
                      <input
                        type="email"
                        className="w-full bg-background px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:bg-muted/30 disabled:opacity-60"
                        value={form.email}
                        disabled={isSaving}
                        aria-invalid={!!errors["email"]}
                        onChange={(e) => set("email", e.target.value)}
                      />
                    </div>
                  </Field>
                  <Field label="Phone" error={errors["phone"]}>
                    <div
                      className={`flex items-stretch overflow-hidden rounded-lg border focus-within:border-primary ${
                        errors["phone"] ? "border-destructive" : "border-border"
                      }`}
                    >
                      <span className="flex items-center bg-muted/50 px-3 text-muted-foreground">
                        <Phone className="size-4" />
                      </span>
                      <input
                        className="w-full bg-background px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:bg-muted/30 disabled:opacity-60"
                        value={form.phone}
                        disabled={isSaving}
                        aria-invalid={!!errors["phone"]}
                        onChange={(e) => set("phone", e.target.value)}
                      />
                    </div>
                  </Field>
                  <Field label="Username" error={errors["username"]}>
                    <input
                      className={inputClass}
                      value={form.username}
                      disabled={isSaving}
                      aria-invalid={!!errors["username"]}
                      onChange={(e) => set("username", e.target.value)}
                    />
                  </Field>
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-card">
                <header className="border-b border-border px-5 py-4">
                  <h2 className="text-base font-semibold text-foreground">Additional Information</h2>
                </header>
                <div className="grid gap-4 p-5">
                  <Field label="Bio" error={errors["bio"]}>
                    <textarea
                      rows={3}
                      className={inputClass}
                      value={form.bio}
                      disabled={isSaving}
                      onChange={(e) => set("bio", e.target.value)}
                    />
                  </Field>
                  <Field label="Internal Notes" error={errors["notes"]}>
                    <textarea
                      rows={3}
                      className={inputClass}
                      value={form.notes}
                      disabled={isSaving}
                      onChange={(e) => set("notes", e.target.value)}
                    />
                  </Field>
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
                    disabled={isSaving}
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
                  Changing the status affects the landlord's ability to sign in. You will be asked to
                  confirm before saving.
                </p>
              </div>
            </section>
          </div>
        </form>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"
          >
            <h3 className="text-lg font-semibold text-foreground">Confirm status change</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              You are changing this landlord's status from <strong>{originalStatus}</strong> to{" "}
              <strong>{form.status}</strong>. This affects their access to the landlord portal.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  mutation.mutate();
                }}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Confirm &amp; Save
              </button>
            </div>
          </div>
        </div>
      )}
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
        {required && (
          <span className="ml-0.5 text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </span>
      {children}
      {error && (
        <span role="alert" className="flex items-start gap-1 text-xs font-medium text-destructive">
          <AlertCircle className="mt-0.5 size-3 shrink-0" />
          <span>{error}</span>
        </span>
      )}
    </label>
  );
}
