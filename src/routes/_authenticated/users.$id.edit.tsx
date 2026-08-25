import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, AtSign, ImagePlus, KeyRound, Phone, Save, ShieldAlert, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { getUserById, sendPasswordReset, updateUser } from "@/lib/users.functions";
import { editUserSchema, fieldErrors } from "@/lib/user-schema";
import { PortalLayout } from "@/components/PortalLayout";
import { ImageCropDialog } from "@/components/ImageCropDialog";

import { supabase } from "@/integrations/supabase/client";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  MIN_IMAGE_DIMENSION,
  extensionForType,
  formatBytes,
  validateProfileImage,
} from "@/lib/image-upload";


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
  bio: string;
  notes: string;
  role: string;
  status: string;
  profile_image: string;
};

const emptyForm: FormState = {
  name: "",
  email: "",
  username: "",
  phone: "",
  bio: "",
  notes: "",
  role: "user",
  status: "active",
  profile_image: "",
};

function EditUserPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchUser = useServerFn(getUserById);
  const save = useServerFn(updateUser);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetStatus, setResetStatus] = useState<
    { ok: true; email: string; at: Date } | { ok: false; message: string; at: Date } | null
  >(null);
  const requestReset = useServerFn(sendPasswordReset);
  const resetMutation = useMutation({
    mutationFn: () =>
      requestReset({
        data: {
          id,
          redirectTo:
            typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined,
        },
      } as never),
    onSuccess: (res: { email?: string }) => {
      const email = res?.email ?? form.email.trim();
      setResetStatus({ ok: true, email, at: new Date() });
      toast.success(`Password reset email sent to ${email || "the user"}`);
    },
    onError: (e: Error) => {
      const message = e.message || "Could not send password reset email";
      setResetStatus({ ok: false, message, at: new Date() });
      toast.error(message);
    },
  });

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
      bio: u.bio ?? "",
      notes: u.notes ?? "",
      role: data.roles?.[0] ?? "user",
      status: u.status ?? "active",
      profile_image: u.profile_image ?? "",
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

  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);

  const uploadBlob = async (blob: Blob, contentType: string) => {
    setUploading(true);
    try {
      const ext = extensionForType(contentType);
      const path = `${id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, contentType });
      if (uploadError) throw uploadError;
      const { data: signed, error: signError } = await supabase.storage
        .from("avatars")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (signError || !signed?.signedUrl) throw signError ?? new Error("Could not link image");
      set("profile_image", signed.signedUrl);
      toast.success("Profile image uploaded — save to apply");
    } catch (e) {
      const message = (e as Error).message || "Could not upload image. Please try again.";
      setImageError(message);
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const onPickImage = async (file: File | undefined) => {
    if (!file) return;
    setImageError(null);
    const check = await validateProfileImage(file);
    if (!check.ok) {
      setImageError(check.error);
      toast.error(check.error);
      return;
    }
    setCropFile(file);
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
          bio: form.bio.trim() || null,
          notes: form.notes.trim() || null,
          status: form.status,
          role: form.role,
          profile_image: form.profile_image.trim() || null,
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

  const originalRole = data?.roles?.[0] ?? "user";
  const originalStatus = data?.user?.status ?? "active";
  const roleChanged = !!data && form.role !== originalRole;
  const statusChanged = !!data && form.status !== originalStatus;

  const validate = () => {
    const parsed = editUserSchema.safeParse({
      name: form.name,
      email: form.email,
      username: form.username,
      phone: form.phone,
      bio: form.bio,
      notes: form.notes,
      role: form.role,
      status: form.status,
    });
    return parsed.success ? {} : fieldErrors(parsed.error);
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
    if (roleChanged || statusChanged) {
      setConfirmOpen(true);
      return;
    }
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
                  <h2 className="text-base font-semibold text-foreground">Profile Image</h2>
                  <p className="text-xs text-muted-foreground">
                    JPG, PNG or WebP · up to {formatBytes(MAX_IMAGE_BYTES)} · between{" "}
                    {MIN_IMAGE_DIMENSION}×{MIN_IMAGE_DIMENSION}px and {MAX_IMAGE_DIMENSION}×
                    {MAX_IMAGE_DIMENSION}px. Changes apply once you save.
                  </p>

                </header>
                <div className="flex flex-wrap items-center gap-5 p-5">
                  <div className="size-20 overflow-hidden rounded-full border border-border bg-muted">
                    {form.profile_image ? (
                      <img
                        src={form.profile_image}
                        alt={form.name ? `${form.name} profile photo` : "Profile photo"}
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-lg font-semibold text-muted-foreground">
                        {(form.name || form.email || "?").slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10">
                      <ImagePlus className="size-4" />
                      {uploading ? "Uploading…" : form.profile_image ? "Change image" : "Browse image"}
                      <input
                        type="file"
                        accept={ALLOWED_IMAGE_TYPES.join(",")}
                        className="sr-only"
                        disabled={uploading}
                        onChange={(e) => {
                          void onPickImage(e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {form.profile_image ? (
                      <button
                        type="button"
                        onClick={() => {
                          setImageError(null);
                          set("profile_image", "");
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="size-4" /> Remove
                      </button>
                    ) : null}
                  </div>
                </div>
                {imageError ? (
                  <div
                    role="alert"
                    className="mx-5 mb-5 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
                  >
                    <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                    <span>{imageError}</span>
                  </div>
                ) : null}
              </section>

              {cropFile ? (
                <ImageCropDialog
                  file={cropFile}
                  onCancel={() => setCropFile(null)}
                  onConfirm={(blob) => {
                    setCropFile(null);
                    void uploadBlob(blob, "image/jpeg");
                  }}
                />
              ) : null}




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
                {(roleChanged || statusChanged) && (
                  <p className="mt-3 flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-foreground">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0 text-primary" />
                    Permission changes pending — you'll be asked to confirm before saving.
                  </p>
                )}

                <div className="mt-5 border-t border-border pt-5">
                  <h3 className="text-sm font-semibold text-foreground">Security</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Send this user a secure link to choose a new password.
                  </p>
                  <button
                    type="button"
                    onClick={() => resetMutation.mutate()}
                    disabled={resetMutation.isPending || !form.email.trim()}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10 disabled:opacity-60"
                  >
                    <KeyRound className="size-4" />
                    {resetMutation.isPending ? "Sending…" : "Send Password Reset"}
                  </button>
                  {!form.email.trim() && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Add an email address to enable password resets.
                    </p>
                  )}
                  {resetMutation.isPending && (
                    <p role="status" className="mt-2 text-xs text-muted-foreground">
                      Sending password reset email…
                    </p>
                  )}
                  {!resetMutation.isPending && resetStatus && (
                    <p
                      role="status"
                      className={
                        resetStatus.ok
                          ? "mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-foreground"
                          : "mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                      }
                    >
                      {resetStatus.ok ? (
                        <>
                          Reset email sent to{" "}
                          <span className="font-medium">{resetStatus.email}</span>. Last sent{" "}
                          {formatSentAt(resetStatus.at)}.
                        </>
                      ) : (
                        <>
                          Couldn't send reset email: {resetStatus.message} (last attempt{" "}
                          {formatSentAt(resetStatus.at)})
                        </>
                      )}
                    </p>
                  )}

                </div>
              </div>
            </section>
          </div>
        )}
      </form>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Confirm permission change"
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"
          >
            <div className="flex items-start gap-3">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <ShieldAlert className="size-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-foreground">Confirm changes</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  You're about to change this account's access. Please review:
                </p>
              </div>
            </div>

            <ul className="mt-4 space-y-2 text-sm">
              {roleChanged && (
                <li className="rounded-lg border border-border bg-background px-3 py-2">
                  <span className="text-muted-foreground">Role: </span>
                  <span className="font-medium text-foreground">{originalRole}</span>
                  <span className="text-muted-foreground"> → </span>
                  <span className="font-semibold text-primary">{form.role}</span>
                </li>
              )}
              {statusChanged && (
                <li className="rounded-lg border border-border bg-background px-3 py-2">
                  <span className="text-muted-foreground">Status: </span>
                  <span className="font-medium text-foreground">{originalStatus}</span>
                  <span className="text-muted-foreground"> → </span>
                  <span className="font-semibold text-primary">{form.status}</span>
                </li>
              )}
            </ul>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/10"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={mutation.isPending}
                onClick={() => {
                  setConfirmOpen(false);
                  mutation.mutate();
                }}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                Confirm & Save
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

function formatSentAt(date: Date) {
  return `${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} on ${date.toLocaleDateString()}`;
}
