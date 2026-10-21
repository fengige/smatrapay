import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { getMyProfile, updateMyProfile } from "@/lib/resident-portal.functions";
import { Card, day, field, residentHead } from "@/components/resident/ResidentUI";

export const Route = createFileRoute("/_authenticated/resident/profile")({
  head: residentHead("My Profile", "Your contact details on SmatraPay."),
  loader: () => checkRoleAccess({ data: { role: "resident" } }),
  component: Page,
  errorComponent: () => <p className="p-8 text-sm">Could not load your profile.</p>,
});

function Page() {
  const access = Route.useLoaderData();
  const getFn = useServerFn(getMyProfile);
  const saveFn = useServerFn(updateMyProfile);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["resident-profile"], queryFn: () => getFn(), enabled: access.allowed });
  const [f, setF] = useState({ name: "", phone: "", address: "" });
  useEffect(() => { if (q.data) setF({ name: q.data.name ?? "", phone: q.data.phone ?? "", address: q.data.address ?? "" }); }, [q.data]);
  const m = useMutation({ mutationFn: () => saveFn({ data: f }), onSuccess: () => { toast.success("Profile saved"); qc.invalidateQueries(); }, onError: (e) => toast.error((e as Error).message) });
  return (
    <DashboardShell access={access} title="My Profile" description="Keep your contact details up to date.">
      <div className="max-w-xl">
        <Card>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
            <label className="block text-sm">Full name<input className={`${field} mt-1`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} /></label>
            <label className="block text-sm">Email<input className={`${field} mt-1`} value={q.data?.email ?? ""} disabled /></label>
            <label className="block text-sm">Phone<input className={`${field} mt-1`} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
            <label className="block text-sm">Address<input className={`${field} mt-1`} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></label>
            <p className="text-xs text-muted-foreground">Member since {day(q.data?.created_at)}. You sign in with Google; your email can't be changed here.</p>
            <button className="btn-primary" disabled={m.isPending}>{m.isPending ? "Saving…" : "Save changes"}</button>
          </form>
        </Card>
      </div>
    </DashboardShell>
  );
}
