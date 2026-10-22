import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { getResidentProfile, saveResidentPersonal } from "@/lib/resident-profile.functions";
import { day, residentHead } from "@/components/resident/ResidentUI";
import { residentPersonalInput } from "@/lib/resident-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Camera, Pencil, UserRound, ShieldCheck, History } from "lucide-react";
import { ResidentPhotoDialog } from "@/components/resident/ResidentPhotoDialog";
import { ResidentSecurity } from "@/components/resident/ResidentSecurity";
import { ResidentProfileAudit } from "@/components/resident/ResidentProfileAudit";
import { ResidentAvatar } from "@/components/resident/ResidentAvatar";

export const Route = createFileRoute("/_authenticated/resident/profile")({
  head: residentHead("My Profile", "Manage your SmatraPay resident information, private profile photo, account security and activity."),
  loader: () => checkRoleAccess({ data: { role: "resident" } }),
  component: Page,
  errorComponent: () => <p className="p-8 text-sm">Could not load your profile.</p>,
});

function Page() {
  const access = Route.useLoaderData();
  const getFn = useServerFn(getResidentProfile);
  const saveFn = useServerFn(saveResidentPersonal);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["resident-profile"], queryFn: () => getFn(), enabled: access.allowed, refetchInterval: 8 * 60 * 1000 });
  const [f, setF] = useState({ name: "", username: "", phone: "", address: "", id_number: "", bio: "" });
  const [editing, setEditing] = useState(false); const [tab, setTab] = useState("personal"); const [photoOpen, setPhotoOpen] = useState(false); const [busy, setBusy] = useState(false); const [errors, setErrors] = useState<Record<string,string>>({});
  const refresh = async () => { await Promise.all(["resident-profile", "resident-profile-audit", "my-access", "users", "user", "vendor-residents", "vendor-resident"].map(key => qc.invalidateQueries({ queryKey: [key] }))); };
  const edit = () => { if (!q.data) return; setF({ name: q.data.name ?? "", username: q.data.username ?? "", phone: q.data.phone ?? "", address: q.data.address ?? "", id_number: q.data.id_number ?? "", bio: q.data.bio ?? "" }); setErrors({}); setEditing(true); setTab("personal"); };
  const profile = q.data;
  return (
    <DashboardShell access={access} title="My Profile" description="">
      {q.isPending ? <p className="py-10 text-sm text-muted-foreground">Loading profile…</p> : q.error || !profile ? <p className="py-10 text-sm text-destructive" role="alert">Could not load your profile. Refresh to try again.</p> : <div className="max-w-5xl">
        <header className="flex flex-wrap items-center gap-5 border-b border-border pb-7">
          <ResidentAvatar photo={profile.photo} name={profile.name} size="header" />
          <div className="min-w-0 flex-1"><h2 className="break-words text-2xl font-bold">{profile.name ?? "Resident"}</h2><p className="mt-1 break-words text-sm text-muted-foreground">{profile.username ? `@${profile.username} · ` : ""}{profile.email}</p><span className="mt-2 inline-block rounded-sm bg-primary/10 px-2 py-1 text-xs font-semibold capitalize text-primary">{profile.status}</span><p className="mt-2 text-xs text-muted-foreground">Member since {day(profile.created_at)}</p></div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={edit}><Pencil />Edit Profile</Button><Button onClick={() => setPhotoOpen(true)}><Camera />Change Photo</Button></div>
        </header>
        <Tabs value={tab} onValueChange={setTab} className="mt-5"><TabsList className="grid h-auto w-full grid-cols-3 sm:w-fit"><TabsTrigger value="personal" className="gap-2"><UserRound className="hidden size-4 sm:block" />Personal Info</TabsTrigger><TabsTrigger value="account" className="gap-2"><ShieldCheck className="hidden size-4 sm:block" />Account</TabsTrigger><TabsTrigger value="audit" className="gap-2"><History className="hidden size-4 sm:block" />Audit Logs</TabsTrigger></TabsList>
          <TabsContent value="personal"><section className="py-6"><div className="mb-6 flex items-center justify-between"><h2 className="text-lg font-semibold">Personal Information</h2>{!editing && <Button variant="outline" onClick={edit}><Pencil />Edit Information</Button>}</div><form className="max-w-3xl space-y-5" onSubmit={async e => { e.preventDefault(); const parsed = residentPersonalInput.safeParse(f); if (!parsed.success) { const next: Record<string,string> = {}; parsed.error.issues.forEach(i => { next[String(i.path[0])] = i.message; }); setErrors(next); return; } setErrors({}); setBusy(true); try { await saveFn({ data: parsed.data }); await refresh(); setEditing(false); toast.success("Information saved"); } catch (e) { const message = (e as Error).message; setErrors({ [message.includes("username") ? "username" : "form"]: message }); } finally { setBusy(false); } }}>
            <div className="grid gap-5 sm:grid-cols-2">{([["name", "Full name"], ["username", "Username"], ["phone", "Phone number"], ["id_number", "National ID"], ["address", "Residential address"], ["bio", "About me"]] as const).map(([key, label]) => <div className="space-y-2" key={key}><Label htmlFor={`profile-${key}`}>{label}</Label>{editing ? <Input id={`profile-${key}`} value={f[key]} disabled={busy} required={key === "name"} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `error-${key}` : undefined} onChange={e => setF({ ...f, [key]: e.target.value })} /> : <p className="break-words text-sm">{profile[key] || "—"}</p>}{errors[key] && <p id={`error-${key}`} className="text-xs text-destructive">{errors[key]}</p>}</div>)}<div className="space-y-2"><Label>Email address</Label><p className="break-words text-sm">{profile.email || "—"}</p><p className="text-xs text-muted-foreground">Contact your account manager to change your verified sign-in email.</p></div></div>
            {errors["form"] && <p role="alert" className="text-sm text-destructive">{errors["form"]}</p>}{editing && <div className="flex gap-2"><Button disabled={busy}>{busy ? "Saving…" : "Save Changes"}</Button><Button variant="outline" type="button" disabled={busy} onClick={() => { setEditing(false); setErrors({}); }}>Cancel</Button></div>}
          </form></section></TabsContent>
          <TabsContent value="account"><ResidentSecurity identifier={profile.email ?? profile.username ?? ""} onChange={() => void refresh()} /></TabsContent>
          <TabsContent value="audit"><ResidentProfileAudit /></TabsContent>
        </Tabs>
        <ResidentPhotoDialog open={photoOpen} setOpen={setPhotoOpen} photo={profile.photo} onChange={refresh} />
      </div>}
    </DashboardShell>
  );
}
