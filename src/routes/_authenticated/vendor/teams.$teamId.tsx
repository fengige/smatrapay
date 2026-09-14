import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import {
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  StatCard,
  StatusBadge,
  formatDate,
  titleCase,
  useVendorScope,
} from "@/components/vendor/VendorUI";
import { Field, VendorModal } from "@/components/vendor/VendorModal";
import { uploadEvidence } from "@/components/vendor/evidence";
import {
  ASSIGNMENT_STATUSES,
  MEMBER_ROLES,
  listInstallationAssignments,
  listInstallationTeams,
  saveTeamMember,
  updateInstallationAssignment,
  type InstallationAssignmentRow,
  type TeamMemberRow,
} from "@/lib/vendor-ops.functions";

export const Route = createFileRoute("/_authenticated/vendor/teams/$teamId")({
  head: () => ({
    meta: [
      { title: "Team Details · Vendor · SmatraPay" },
      { name: "description", content: "Installation team members and their meter installation assignments." },
      { property: "og:title", content: "Team Details · Vendor · SmatraPay" },
      { property: "og:description", content: "Manage team members and complete installation assignments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: TeamDetail,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{error.message}</p>,
});

function TeamDetail() {
  const access = Route.useLoaderData();
  const { teamId } = Route.useParams();
  const queryClient = useQueryClient();
  const scope = useVendorScope();
  const fetchTeams = useServerFn(listInstallationTeams);
  const fetchAssignments = useServerFn(listInstallationAssignments);
  const saveMember = useServerFn(saveTeamMember);
  const updateAssignment = useServerFn(updateInstallationAssignment);

  const teamsQuery = useQuery({ queryKey: ["vendor-teams"], queryFn: () => fetchTeams() });
  const assignmentsQuery = useQuery({
    queryKey: ["vendor-installations"],
    queryFn: () => fetchAssignments(),
  });

  const [memberOpen, setMemberOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMemberRow | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<(typeof MEMBER_ROLES)[number]>("Installer");
  const [memberStatus, setMemberStatus] = useState<"active" | "inactive">("active");

  const [completing, setCompleting] = useState<InstallationAssignmentRow | null>(null);
  const [installer, setInstaller] = useState("");
  const [reading, setReading] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const team = (teamsQuery.data?.teams ?? []).find((t) => t.id === teamId);
  const members = (teamsQuery.data?.members ?? []).filter((m) => m.team_id === teamId);
  const assignments = (assignmentsQuery.data?.assignments ?? []).filter((a) => a.team_id === teamId);
  const meters = scope.data?.meters ?? [];
  const meterById = useMemo(() => new Map(meters.map((m) => [m.id, m])), [meters]);

  const openMember = (member: TeamMemberRow | null) => {
    setEditingMember(member);
    setMemberOpen(true);
    setName(member?.name ?? "");
    setPhone(member?.phone ?? "");
    setRole((member?.role as (typeof MEMBER_ROLES)[number]) ?? "Installer");
    setMemberStatus((member?.status as "active" | "inactive") ?? "active");
  };

  const memberMutation = useMutation({
    mutationFn: () =>
      saveMember({
        data: {
          ...(editingMember ? { id: editingMember.id } : {}),
          team_id: teamId,
          name: name.trim(),
          phone: phone.trim() || undefined,
          role,
          status: memberStatus,
        },
      }),
    onSuccess: async () => {
      setMemberOpen(false);
      setEditingMember(null);
      await queryClient.invalidateQueries({ queryKey: ["vendor-teams"] });
      toast.success("Team member saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: (input: { id: string; status: (typeof ASSIGNMENT_STATUSES)[number] }) =>
      updateAssignment({ data: input }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["vendor-installations"] }),
        queryClient.invalidateQueries({ queryKey: ["vendor-scope"] }),
      ]);
      toast.success("Assignment updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!completing) throw new Error("No assignment selected");
      setBusy(true);
      try {
        const path = file ? await uploadEvidence(file, "installations") : undefined;
        return await updateAssignment({
          data: {
            id: completing.id,
            status: "completed",
            installer_name: installer.trim() || undefined,
            location: location.trim() || undefined,
            completion_reading: reading === "" ? null : Number(reading),
            completion_notes: notes.trim() || undefined,
            ...(path ? { photo_paths: [path] } : {}),
          },
        });
      } finally {
        setBusy(false);
      }
    },
    onSuccess: async () => {
      setCompleting(null);
      setInstaller("");
      setReading("");
      setLocation("");
      setNotes("");
      setFile(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["vendor-installations"] }),
        queryClient.invalidateQueries({ queryKey: ["vendor-scope"] }),
      ]);
      toast.success("Installation completed — the meter is now eligible for activation");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DashboardShell
      access={access}
      title={team?.name ?? "Installation team"}
      description="Team members and installation assignments."
      actions={
        <Link to="/vendor/teams" className="btn-outline inline-flex items-center gap-2 px-3 py-1.5 text-sm">
          <ArrowLeft className="size-4" /> Back to teams
        </Link>
      }
    >
      {teamsQuery.error || assignmentsQuery.error ? (
        <ErrorBlock message={((teamsQuery.error ?? assignmentsQuery.error) as Error).message} />
      ) : teamsQuery.isLoading || assignmentsQuery.isLoading ? (
        <LoadingBlock />
      ) : !team ? (
        <EmptyState title="Team not found" message="This team is not available on your vendor account." />
      ) : (
        <div className="space-y-4 pb-8">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Members" value={team.member_count} />
            <StatCard label="Active assignments" value={team.active_assignments} />
            <StatCard label="Completed installations" value={team.completed_installations} />
            <StatCard label="Status" value={titleCase(team.status)} />
          </div>

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-bold text-foreground">Team information</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Field label="Team name" value={team.name} />
              <Field label="Team leader" value={team.leader_name ?? "—"} />
              <Field label="Phone" value={team.phone ?? "—"} />
              <Field label="Created" value={formatDate(team.created_at)} />
              <Field label="Status" value={<StatusBadge value={team.status} />} />
            </div>
            {team.description && <p className="mt-3 text-sm text-muted-foreground">{team.description}</p>}
          </section>

          <section className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground">Members</h2>
              <button className="btn-primary px-3 py-1.5 text-sm" onClick={() => openMember(null)}>
                Add member
              </button>
            </div>
            {members.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No members added to this team yet.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[42rem] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-2">Name</th>
                      <th className="py-2">Phone</th>
                      <th className="py-2">Role</th>
                      <th className="py-2">Open requests</th>
                      <th className="py-2">Status</th>
                      <th className="py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.id} className="border-t border-border">
                        <td className="py-2 font-semibold text-foreground">{m.name}</td>
                        <td className="py-2 text-muted-foreground">{m.phone ?? "—"}</td>
                        <td className="py-2 text-muted-foreground">{m.role}</td>
                        <td className="py-2 text-muted-foreground">{m.open_requests}</td>
                        <td className="py-2">
                          <StatusBadge value={m.status} />
                        </td>
                        <td className="py-2 text-right">
                          <button className="btn-outline px-3 py-1 text-xs" onClick={() => openMember(m)}>
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-bold text-foreground">Installation assignments</h2>
            {assignments.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No installations assigned to this team.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[54rem] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-2">Assignment</th>
                      <th className="py-2">Meter</th>
                      <th className="py-2">Resident</th>
                      <th className="py-2">Scheduled</th>
                      <th className="py-2">Status</th>
                      <th className="py-2">Completed</th>
                      <th className="py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((a) => {
                      const m = meterById.get(a.meter_id);
                      const done = ["completed", "cancelled", "failed"].includes(a.status);
                      return (
                        <tr key={a.id} className="border-t border-border">
                          <td className="py-2 font-semibold text-foreground">{a.assignment_number}</td>
                          <td className="py-2 text-muted-foreground">{m?.meter_number ?? "—"}</td>
                          <td className="py-2 text-muted-foreground">{m?.resident_name ?? "—"}</td>
                          <td className="py-2 text-muted-foreground">
                            {formatDate(a.scheduled_date)} {a.scheduled_time ?? ""}
                          </td>
                          <td className="py-2">
                            <StatusBadge value={a.status} />
                          </td>
                          <td className="py-2 text-muted-foreground">{formatDate(a.completed_at)}</td>
                          <td className="py-2">
                            <div className="flex justify-end gap-2">
                              {!done && (
                                <>
                                  <select
                                    className="input w-auto py-1 text-xs"
                                    value={a.status}
                                    onChange={(e) =>
                                      statusMutation.mutate({
                                        id: a.id,
                                        status: e.target.value as (typeof ASSIGNMENT_STATUSES)[number],
                                      })
                                    }
                                    aria-label="Assignment status"
                                  >
                                    {ASSIGNMENT_STATUSES.filter((s) => s !== "completed").map((s) => (
                                      <option key={s} value={s}>
                                        {titleCase(s)}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    className="btn-primary px-3 py-1 text-xs"
                                    onClick={() => setCompleting(a)}
                                  >
                                    Complete
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {memberOpen && (
        <VendorModal title={editingMember ? "Edit member" : "Add team member"} onClose={() => setMemberOpen(false)}>
          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase text-muted-foreground">
              Name
              <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold uppercase text-muted-foreground">
                Phone
                <input className="input mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </label>
              <label className="block text-xs font-semibold uppercase text-muted-foreground">
                Role
                <select
                  className="input mt-1"
                  value={role}
                  onChange={(e) => setRole(e.target.value as (typeof MEMBER_ROLES)[number])}
                >
                  {MEMBER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-xs font-semibold uppercase text-muted-foreground">
              Status
              <select
                className="input mt-1"
                value={memberStatus}
                onChange={(e) => setMemberStatus(e.target.value as "active" | "inactive")}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-outline px-3 py-1.5 text-sm" onClick={() => setMemberOpen(false)}>
                Cancel
              </button>
              <button
                className="btn-primary px-3 py-1.5 text-sm"
                disabled={name.trim().length < 2 || memberMutation.isPending}
                onClick={() => memberMutation.mutate()}
              >
                {memberMutation.isPending ? "Saving…" : "Save member"}
              </button>
            </div>
          </div>
        </VendorModal>
      )}

      {completing && (
        <VendorModal title={`Complete ${completing.assignment_number}`} onClose={() => setCompleting(null)}>
          <div className="space-y-3">
            <Field label="Meter" value={meterById.get(completing.meter_id)?.meter_number ?? "—"} />
            <Field label="Serial number" value={meterById.get(completing.meter_id)?.serial_number ?? "—"} />
            <label className="block text-xs font-semibold uppercase text-muted-foreground">
              Installer / team member
              <input className="input mt-1" value={installer} onChange={(e) => setInstaller(e.target.value)} />
            </label>
            <label className="block text-xs font-semibold uppercase text-muted-foreground">
              Initial reading
              <input
                className="input mt-1"
                type="number"
                min="0"
                step="0.01"
                value={reading}
                onChange={(e) => setReading(e.target.value)}
              />
            </label>
            <label className="block text-xs font-semibold uppercase text-muted-foreground">
              Installation location
              <input className="input mt-1" value={location} onChange={(e) => setLocation(e.target.value)} />
            </label>
            <label className="block text-xs font-semibold uppercase text-muted-foreground">
              Notes
              <textarea className="input mt-1" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <label className="block text-xs font-semibold uppercase text-muted-foreground">
              Meter photo
              <input
                className="input mt-1"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-outline px-3 py-1.5 text-sm" onClick={() => setCompleting(null)}>
                Cancel
              </button>
              <button
                className="btn-primary px-3 py-1.5 text-sm"
                disabled={busy || completeMutation.isPending}
                onClick={() => completeMutation.mutate()}
              >
                {busy || completeMutation.isPending ? "Saving…" : "Mark installed"}
              </button>
            </div>
          </div>
        </VendorModal>
      )}
    </DashboardShell>
  );
}
