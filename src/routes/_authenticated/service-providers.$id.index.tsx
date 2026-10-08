import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import {
  ArrowLeft,
  Briefcase,
  Camera,
  CheckCircle2,
  Clock,
  KeyRound,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { PortalLayout } from "@/components/PortalLayout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { extensionForType, validateProfileImage } from "@/lib/image-upload";
import { sendPasswordReset } from "@/lib/users.functions";
import { serviceEntrySchema } from "@/lib/service-provider-schema";
import {
  addProviderService,
  getServiceProvider,
  listProviderJobs,
  removeProviderService,
  setServiceProviderImage,
  updateProviderService,
} from "@/lib/service-providers.functions";
import {
  Field,
  inputClass,
  ProviderAvatar,
  StatusPill,
  useProviderActions,
} from "@/components/service-providers/ProviderUI";

export const Route = createFileRoute("/_authenticated/service-providers/$id/")({
  head: () => ({
    meta: [
      { title: "Service Provider Details · SmatraPay" },
      {
        name: "description",
        content: "Service provider overview, account, services offered and jobs.",
      },
      { property: "og:title", content: "Service Provider Details · SmatraPay" },
      {
        property: "og:description",
        content: "Overview, account info, services and jobs for a service provider.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProviderDetails,
});

const fmtDate = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString() : "—");
const fmtDateTime = (v: string | null | undefined) => (v ? new Date(v).toLocaleString() : "—");

function ProviderDetails() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const fetchOne = useServerFn(getServiceProvider);
  const { data, isLoading, error } = useQuery({
    queryKey: ["service-provider", id],
    queryFn: () => fetchOne({ data: { id } }),
  });
  const { run, dialog, busy } = useProviderActions((a) => {
    if (a === "delete") navigate({ to: "/service-providers", search: { page: 1, limit: 10 } });
  });
  const [tab, setTab] = useState("overview");

  if (error)
    return (
      <PortalLayout roles={["admin"]} title="Service Provider" description="">
        <p className="p-6 text-sm text-destructive">{(error as Error).message}</p>
      </PortalLayout>
    );
  if (isLoading || !data)
    return (
      <PortalLayout roles={["admin"]} title="Service Provider" description="">
        <div className="flex justify-center p-10">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </PortalLayout>
    );

  const u = data.user as any;
  const p = (data.profile ?? {}) as any;
  const location = [p.city, p.county, p.country].filter(Boolean).join(", ") || "—";
  const target = { id, name: u.name, email: u.email };

  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" asChild>
        <Link to="/service-providers/$id/edit" params={{ id }}>
          <Pencil /> Edit
        </Link>
      </Button>
      {u.status === "suspended" ? (
        <Button variant="outline" disabled={busy} onClick={() => run("unsuspend", target)}>
          <Play /> Unsuspend
        </Button>
      ) : (
        <Button variant="outline" disabled={busy} onClick={() => run("suspend", target)}>
          <Pause /> Suspend
        </Button>
      )}
      <Button
        variant="outline"
        className="text-destructive"
        disabled={busy}
        onClick={() => run("delete", target)}
      >
        <Trash2 /> Delete
      </Button>
    </div>
  );

  return (
    <PortalLayout
      roles={["admin"]}
      title="Service Provider Management"
      description="Service provider details"
    >
      {dialog}
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Link
              to="/service-providers"
              search={{ page: 1, limit: 10 }}
              aria-label="Back to service providers"
              className="mt-1 inline-flex size-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-accent/10"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{u.name}</h1>
              <p className="text-sm text-muted-foreground">
                {p.business_name || "Service Provider"}
              </p>
            </div>
          </div>
          {actions}
        </div>

        <section className="grid gap-5 rounded-2xl border border-border bg-card p-5 md:grid-cols-[auto_auto_1fr]">
          <ImageSlot providerId={id} kind="photo" url={u.profile_image} name={u.name} />
          <ImageSlot
            providerId={id}
            kind="logo"
            url={p.logo_url}
            name={p.business_name || u.name}
          />
          <div className="grid content-start gap-2 text-sm sm:grid-cols-2">
            <Info label="Email" value={u.email} />
            <Info label="Phone" value={u.phone} />
            <Info label="Location" value={location} />
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <StatusPill status={u.status} />
            </div>
          </div>
        </section>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="account">Account Info</TabsTrigger>
            <TabsTrigger value="services">Services Offered</TabsTrigger>
            <TabsTrigger value="jobs">My Jobs</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 pt-3">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <Stat label="Services Offered" value={data.services.length} icon={Wrench} />
              <Stat label="Total Jobs" value={data.stats.total} icon={Briefcase} />
              <Stat label="Pending Jobs" value={data.stats.pending} icon={Clock} />
              <Stat label="In Progress" value={data.stats.inProgress} icon={Loader2} />
              <Stat label="Completed" value={data.stats.completed} icon={CheckCircle2} />
            </div>
            <div className="grid gap-3 rounded-2xl border border-border bg-card p-5 text-sm sm:grid-cols-3">
              <Info label="Full Name" value={u.name} />
              <Info label="Business Name" value={p.business_name} />
              <Info label="Date Joined" value={fmtDate(u.created_at)} />
              <Info label="Email" value={u.email} />
              <Info label="Phone" value={u.phone} />
              <Info label="Location" value={location} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setTab("services")}>
                <Wrench /> Manage Services
              </Button>
              <Button variant="outline" onClick={() => setTab("jobs")}>
                <Briefcase /> View Jobs
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="account" className="pt-3">
            <AccountTab user={u} profile={p} lastLogin={data.lastLogin} />
          </TabsContent>

          <TabsContent value="services" className="pt-3">
            <ServicesTab providerId={id} services={data.services as any[]} />
          </TabsContent>

          <TabsContent value="jobs" className="pt-3">
            <JobsTab providerId={id} />
          </TabsContent>
        </Tabs>
      </div>
    </PortalLayout>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium text-foreground">{value || "—"}</p>
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Wrench }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <span className="flex size-9 items-center justify-center rounded-xl bg-primary/12 text-primary">
        <Icon className="size-4" />
      </span>
      <p className="mt-3 text-2xl font-extrabold text-foreground">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function ImageSlot({
  providerId,
  kind,
  url,
  name,
}: {
  providerId: string;
  kind: "logo" | "photo";
  url: string | null;
  name: string | null;
}) {
  const qc = useQueryClient();
  const save = useServerFn(setServiceProviderImage);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const label = kind === "logo" ? "Logo" : "Profile Photo";

  const persist = async (value: string | null) => {
    await save({ data: { id: providerId, kind, url: value } });
    await qc.invalidateQueries({ queryKey: ["service-provider", providerId] });
    await qc.invalidateQueries({ queryKey: ["service-providers"] });
  };

  const pick = async (file?: File) => {
    if (!file) return;
    const check = await validateProfileImage(file);
    if (!check.ok) {
      toast.error(check.error);
      return;
    }
    setBusy(true);
    try {
      const path = `${providerId}/${kind}-${Date.now()}.${extensionForType(file.type)}`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, file, { contentType: file.type });
      if (error) throw error;
      const { data: signed, error: sErr } = await supabase.storage
        .from("avatars")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (sErr || !signed?.signedUrl) throw sErr ?? new Error("Could not link image");
      await persist(signed.signedUrl);
      toast.success(`${label} updated`);
    } catch (e) {
      toast.error((e as Error).message || `Could not upload ${label.toLowerCase()}`);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await persist(null);
      toast.success(`${label} removed`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <div className="relative">
        <ProviderAvatar
          src={url}
          name={name}
          className="size-24 text-2xl"
          rounded={kind === "logo" ? "rounded-2xl" : "rounded-full"}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          aria-label={`${url ? "Replace" : "Upload"} ${label.toLowerCase()}`}
          className="absolute -bottom-1 -right-1 inline-flex size-8 items-center justify-center rounded-full border border-border bg-background shadow-sm hover:bg-accent/10"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      <div className="flex gap-3 text-xs">
        <button
          type="button"
          className="font-semibold text-primary hover:underline"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {url ? "Replace" : `Upload ${label}`}
        </button>
        {url && (
          <button
            type="button"
            className="text-destructive hover:underline"
            disabled={busy}
            onClick={() => void remove()}
          >
            Remove
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">JPG, PNG or WebP · max 5MB</p>
    </div>
  );
}

function AccountTab({
  user,
  profile,
  lastLogin,
}: {
  user: any;
  profile: any;
  lastLogin: string | null;
}) {
  const reset = useServerFn(sendPasswordReset);
  const mutation = useMutation({
    mutationFn: () =>
      reset({ data: { id: user.id, redirectTo: `${window.location.origin}/reset-password` } }),
    onSuccess: (r) => toast.success(`Password reset email sent to ${r.email}`),
    onError: (e: Error) => toast.error(e.message),
  });
  const location = [profile.city, profile.county, profile.country].filter(Boolean).join(", ");
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-4 font-semibold">Personal Information</h3>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <Info label="First Name" value={profile.first_name} />
          <Info label="Middle Name" value={profile.middle_name} />
          <Info label="Last Name" value={profile.last_name} />
          <Info label="Email" value={user.email} />
          <Info label="Phone" value={user.phone} />
          <Info label="Address" value={user.address} />
          <Info label="Postal Address" value={profile.postal_address} />
          <Info label="Location" value={location} />
        </div>
      </section>
      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-4 font-semibold">Account Information</h3>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <Info label="Username" value={user.username} />
          <Info label="User Role" value="Service Provider" />
          <div>
            <p className="text-xs text-muted-foreground">Account Status</p>
            <StatusPill status={user.status} />
          </div>
          <Info label="Date Created" value={fmtDateTime(user.created_at)} />
          <Info label="Last Login" value={fmtDateTime(lastLogin)} />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to="/service-providers/$id/edit" params={{ id: user.id }}>
              <Pencil /> Edit Account
            </Link>
          </Button>
          <Button
            variant="outline"
            disabled={mutation.isPending || !user.email}
            onClick={() => mutation.mutate()}
          >
            <KeyRound /> {mutation.isPending ? "Sending…" : "Reset Password"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function ServicesTab({ providerId, services }: { providerId: string; services: any[] }) {
  const qc = useQueryClient();
  const add = useServerFn(addProviderService);
  const update = useServerFn(updateProviderService);
  const remove = useServerFn(removeProviderService);
  const [editing, setEditing] = useState<{
    id?: string;
    service_name: string;
    description: string;
    status?: string;
  } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toDelete, setToDelete] = useState<any | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["service-provider", providerId] });

  const save = useMutation({
    mutationFn: async (v: NonNullable<typeof editing>) =>
      v.id
        ? update({
            data: {
              id: v.id,
              service_name: v.service_name,
              description: v.description,
              status: (v.status as "active" | "inactive") ?? "active",
            },
          })
        : add({
            data: {
              provider_id: providerId,
              service_name: v.service_name,
              description: v.description,
            },
          }),
    onSuccess: async () => {
      toast.success("Service saved");
      setEditing(null);
      await refresh();
      await qc.invalidateQueries({ queryKey: ["service-providers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (sid: string) => remove({ data: { id: sid } }),
    onSuccess: async () => {
      toast.success("Service removed");
      setToDelete(null);
      await refresh();
      await qc.invalidateQueries({ queryKey: ["service-providers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => {
    if (!editing) return;
    const parsed = serviceEntrySchema.safeParse(editing);
    if (!parsed.success) {
      const out: Record<string, string> = {};
      for (const i of parsed.error.issues) out[String(i.path[0])] ??= i.message;
      setErrors(out);
      return;
    }
    setErrors({});
    save.mutate(editing);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-4">
        <h3 className="font-semibold">Services Offered</h3>
        <Button onClick={() => setEditing({ service_name: "", description: "" })}>
          <Plus /> Add Service
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Service</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date Added</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {services.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  No services yet. Add the first one.
                </td>
              </tr>
            ) : (
              services.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-4 py-3 font-semibold">{s.service_name}</td>
                  <td className="max-w-md px-4 py-3 text-muted-foreground">{s.description}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={s.status} />
                  </td>
                  <td className="px-4 py-3">{fmtDate(s.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Edit service"
                        onClick={() => setEditing({ ...s })}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove service"
                        className="text-destructive"
                        onClick={() => setToDelete(s)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit Service" : "Add Service"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <Field label="Service Name" required error={errors["service_name"]}>
                <input
                  className={inputClass}
                  value={editing.service_name}
                  onChange={(e) => setEditing({ ...editing, service_name: e.target.value })}
                />
              </Field>
              <Field label="Service Description" required error={errors["description"]}>
                <textarea
                  rows={3}
                  className={inputClass}
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </Field>
              {editing.id && (
                <Field label="Status">
                  <select
                    className={inputClass}
                    value={editing.status ?? "active"}
                    onChange={(e) => setEditing({ ...editing, status: e.target.value })}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </Field>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save Service"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove service?</AlertDialogTitle>
            <AlertDialogDescription>
              “{toDelete?.service_name}” will be removed from this provider's services. Existing
              jobs are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (toDelete) del.mutate(toDelete.id);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const JOB_STATUSES = [
  "open",
  "assigned",
  "in_progress",
  "resolved",
  "closed",
  "cancelled",
] as const;

function JobsTab({ providerId }: { providerId: string }) {
  const fetchJobs = useServerFn(listProviderJobs);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<any | null>(null);
  const limit = 10;

  const { data, isLoading, error } = useQuery({
    queryKey: ["service-provider-jobs", providerId, { q, status, from, to, page }],
    queryFn: () =>
      fetchJobs({
        data: {
          id: providerId,
          q: q || undefined,
          status: status === "all" ? undefined : (status as (typeof JOB_STATUSES)[number]),
          from: from || undefined,
          to: to || undefined,
          page,
          limit,
        },
      }),
    placeholderData: keepPreviousData,
  });
  const rows = data?.rows ?? [];
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / limit));
  const reset =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      fn(v);
      setPage(1);
    };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
        <div className="input-shell flex min-w-56 flex-1 items-center gap-2">
          <Search className="size-4 text-muted-foreground" />
          <input
            className="input-field min-w-0"
            placeholder="Search job ID, service or description"
            aria-label="Search jobs"
            value={q}
            onChange={(e) => reset(setQ)(e.target.value)}
          />
        </div>
        <select
          aria-label="Job status"
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm capitalize"
          value={status}
          onChange={(e) => reset(setStatus)(e.target.value)}
        >
          <option value="all">All statuses</option>
          {JOB_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
        <input
          type="date"
          aria-label="From date"
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          value={from}
          onChange={(e) => reset(setFrom)(e.target.value)}
        />
        <input
          type="date"
          aria-label="To date"
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          value={to}
          onChange={(e) => reset(setTo)(e.target.value)}
        />
      </div>
      {error ? (
        <p className="p-6 text-sm text-destructive">{(error as Error).message}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                {[
                  "Job ID",
                  "Service",
                  "Resident",
                  "Property",
                  "Unit",
                  "Description",
                  "Requested",
                  "Scheduled",
                  "Status",
                  "Completed",
                  "Actions",
                ].map((h) => (
                  <th key={h} className="px-3 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-muted-foreground">
                    Loading jobs…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-muted-foreground">
                    No jobs found for this service provider.
                  </td>
                </tr>
              ) : (
                rows.map((j: any) => (
                  <tr
                    key={j.id}
                    className="cursor-pointer border-t border-border hover:bg-muted/30"
                    onClick={() => setOpen(j)}
                  >
                    <td className="px-3 py-3 font-semibold">{j.request_number}</td>
                    <td className="px-3 py-3 capitalize">
                      {String(j.issue_type).replace(/_/g, " ")}
                    </td>
                    <td className="px-3 py-3">{j.resident_name ?? "—"}</td>
                    <td className="px-3 py-3">{j.property_name ?? "—"}</td>
                    <td className="px-3 py-3">{j.unit_number ?? "—"}</td>
                    <td className="max-w-[220px] truncate px-3 py-3">{j.description ?? "—"}</td>
                    <td className="px-3 py-3">{fmtDate(j.created_at)}</td>
                    <td className="px-3 py-3">{fmtDate(j.preferred_date)}</td>
                    <td className="px-3 py-3">
                      <StatusPill status={j.status} />
                    </td>
                    <td className="px-3 py-3">{fmtDate(j.completed_at)}</td>
                    <td className="px-3 py-3">
                      <Button variant="ghost" size="sm" onClick={() => setOpen(j)}>
                        View
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-between border-t border-border p-4 text-sm text-muted-foreground">
        <span>{data?.total ?? 0} jobs</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <span>
            Page {page} / {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Job {open?.request_number}</DialogTitle>
          </DialogHeader>
          {open && (
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <Info label="Service" value={String(open.issue_type).replace(/_/g, " ")} />
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <StatusPill status={open.status} />
              </div>
              <Info label="Priority" value={open.priority} />
              <Info label="Meter" value={open.meter_number} />
              <Info label="Resident" value={open.resident_name} />
              <Info
                label="Property / Unit"
                value={[open.property_name, open.unit_number].filter(Boolean).join(" · ")}
              />
              <Info label="Requested" value={fmtDateTime(open.created_at)} />
              <Info label="Scheduled" value={fmtDate(open.preferred_date)} />
              <Info label="Completed" value={fmtDateTime(open.completed_at)} />
              <div className="sm:col-span-2">
                <Info label="Description" value={open.description} />
              </div>
              <div className="sm:col-span-2">
                <Info label="Work performed" value={open.work_performed} />
              </div>
              <div className="sm:col-span-2">
                <Info label="Resolution" value={open.resolution} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
