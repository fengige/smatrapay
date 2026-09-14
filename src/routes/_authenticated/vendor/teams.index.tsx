import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import {
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  Pagination,
  StatCard,
  StatusBadge,
  formatDate,
  titleCase,
  useVendorScope,
} from "@/components/vendor/VendorUI";
import { VendorModal } from "@/components/vendor/VendorModal";
import {
  ASSIGNMENT_STATUSES,
  listInstallationAssignments,
  listInstallationTeams,
  saveInstallationTeam,
  scheduleInstallation,
  type TeamRow,
} from "@/lib/vendor-ops.functions";

const PAGE_SIZE = 10;

export const Route = createFileRoute("/_authenticated/vendor/teams/")({
  head: () => ({
    meta: [
      { title: "Installation Teams · Vendor · SmatraPay" },
      { name: "description", content: "Manage installation teams and schedule meter installations." },
      { property: "og:title", content: "Installation Teams · Vendor · SmatraPay" },
      { property: "og:description", content: "Teams, members and installation assignments for your vendor account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorTeams,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{error.message}</p>,
});

function VendorTeams() {
  const access = Route.useLoaderData();
  const queryClient = useQueryClient();
  const scope = useVendorScope();
  const fetchTeams = useServerFn(listInstallationTeams);
  const fetchAssignments = useServerFn(listInstallationAssignments);
  const saveTeam = useServerFn(saveInstallationTeam);
  const schedule = useServerFn(scheduleInstallation);

  const teamsQuery = useQuery({ queryKey: ["vendor-teams"], queryFn: () => fetchTeams() });
  const assignmentsQuery = useQuery({
    queryKey: ["vendor-installations"],
    queryFn: () => fetchAssignments(),
  });

  const [tab, setTab] = useState<"teams" | "assignments">("teams");
  const [editing, setEditing] = useState<TeamRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [leader, setLeader] = useState("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");

  const [scheduling, setScheduling] = useState(false);
  const [meterId, setMeterId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  const [assignStatus, setAssignStatus] = useState("all");
  const [page, setPage] = useState(1);

  const teams = teamsQuery.data?.teams ?? [];
  const assignments = assignmentsQuery.data?.assignments ?? [];
  const meters = scope.data?.meters ?? [];
  const meterById = useMemo(() => new Map(meters.map((m) => [m.id, m])), [meters]);
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const selectedMeter = meterId ? meterById.get(meterId) : undefined;

  const filteredAssignments = assignments.filter(
    (a) => assignStatus === "all" || a.status === assignStatus,
  );
  const pageCount = Math.max(1, Math.ceil(filteredAssignments.length / PAGE_SIZE));
  const currentAssignments = filteredAssignments.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openTeam = (team: TeamRow | null) => {
    setEditing(team);
    setCreating(true);
    setName(team?.name ?? "");
    setLeader(team?.leader_name ?? "");
    setPhone(team?.phone ?? "");
    setDescription(team?.description ?? "");
    setStatus((team?.status as "active" | "inactive") ?? "active");
  };

  const teamMutation = useMutation({
    mutationFn: () =>
      saveTeam({
        data: {
          ...(editing ? { id: editing.id } : {}),
          name: name.trim(),
          leader_name: leader.trim() || undefined,
          phone: phone.trim() || undefined,
          description: description.trim() || undefined,
          status,
        },
      }),
    onSuccess: async () => {
      setCreating(false);
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ["vendor-teams"] });
      toast.success("Team saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleTeam = useMutation({
    mutationFn: (team: TeamRow) =>
      saveTeam({
        data: {
          id: team.id,
          name: team.name,
          leader_name: team.leader_name ?? undefined,
          phone: team.phone ?? undefined,
          description: team.description ?? undefined,
          status: team.status === "active" ? "inactive" : "active",
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["vendor-teams"] });
      toast.success("Team status updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const scheduleMutation = useMutation({
    mutationFn: () =>
      schedule({
        data: {
          meter_id: meterId,
          team_id: teamId,
          resident_id: selectedMeter?.resident_id ?? null,
          zone_id: selectedMeter?.zone_id ?? null,
          scheduled_date: date,
          scheduled_time: time || undefined,
          location: location.trim() || undefined,
          notes: notes.trim() || undefined,
        },
      }),
    onSuccess: async (res) => {
      setScheduling(false);
      setMeterId("");
      setTeamId("");
      setDate("");
      setTime("");
      setLocation("");
      setNotes("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["vendor-installations"] }),
        queryClient.invalidateQueries({ queryKey: ["vendor-scope"] }),
      ]);
      toast.success(`Installation ${res.assignment_number} scheduled`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DashboardShell
      access={access}
      title="Installation Teams"
      description="Teams, members and meter installation assignments."
      actions={
        <div className="flex gap-2">
          <button className="btn-outline px-3 py-1.5 text-sm" onClick={() => setScheduling(true)}>
            Schedule installation
          </button>
          <button className="btn-primary px-3 py-1.5 text-sm" onClick={() => openTeam(null)}>
            New team
          </button>
        </div>
      }
    >
      {teamsQuery.error || assignmentsQuery.error ? (
        <ErrorBlock message={((teamsQuery.error ?? assignmentsQuery.error) as Error).message} />
      ) : teamsQuery.isLoading || assignmentsQuery.isLoading ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-4 pb-8">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Teams" value={teams.length} />
            <StatCard label="Active teams" value={teams.filter((t) => t.status === "active").length} />
            <StatCard
              label="Pending installations"
              value={
                assignments.filter((a) => !["completed", "cancelled", "failed"].includes(a.status)).length
              }
            />
            <StatCard
              label="Completed installations"
              value={assignments.filter((a) => a.status === "completed").length}
            />
          </div>

          <div className="flex gap-2 border-b border-border">
            {(["teams", "assignments"] as const).map((t) => (
              <button
                key={t}
                className={`px-3 py-2 text-sm font-semibold ${
                  tab === t ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"
                }`}
                onClick={() => setTab(t)}
              >
                {t === "teams" ? "Teams" : "Installation assignments"}
              </button>
            ))}
          </div>

          {tab === "teams" ? (
            teams.length === 0 ? (
              <EmptyState title="No teams yet" message="Create your first installation team to get started." />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border bg-card">
                <table className="w-full min-w-[54rem] text-left text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Team</th>
                      <th className="px-4 py-3">Leader</th>
                      <th className="px-4 py-3">Members</th>
                      <th className="px-4 py-3">Active assignments</th>
                      <th className="px-4 py-3">Completed</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teams.map((t) => (
                      <tr key={t.id} className="border-t border-border">
                        <td className="px-4 py-3 font-semibold text-foreground">{t.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{t.leader_name ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{t.member_count}</td>
                        <td className="px-4 py-3 text-muted-foreground">{t.active_assignments}</td>
                        <td className="px-4 py-3 text-muted-foreground">{t.completed_installations}</td>
                        <td className="px-4 py-3">
                          <StatusBadge value={t.status} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(t.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <Link
                              to="/vendor/teams/$teamId"
                              params={{ teamId: t.id }}
                              className="btn-outline px-3 py-1 text-xs"
                            >
                              View
                            </Link>
                            <button className="btn-outline px-3 py-1 text-xs" onClick={() => openTeam(t)}>
                              Edit
                            </button>
                            <button
                              className="btn-outline px-3 py-1 text-xs"
                              onClick={() => toggleTeam.mutate(t)}
                              disabled={toggleTeam.isPending}
                            >
                              {t.status === "active" ? "Deactivate" : "Activate"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <>
              <div className="rounded-2xl border border-border bg-card p-3">
                <select
                  className="input md:w-64"
                  value={assignStatus}
                  onChange={(e) => {
                    setAssignStatus(e.target.value);
                    setPage(1);
                  }}
                  aria-label="Assignment status"
                >
                  <option value="all">Any status</option>
                  {ASSIGNMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {titleCase(s)}
                    </option>
                  ))}
                </select>
              </div>
              {currentAssignments.length === 0 ? (
                <EmptyState
                  title="No installation assignments"
                  message="Schedule an installation to see it listed here."
                />
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-border bg-card">
                  <table className="w-full min-w-[58rem] text-left text-sm">
                    <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">Assignment</th>
                        <th className="px-4 py-3">Meter</th>
                        <th className="px-4 py-3">Resident</th>
                        <th className="px-4 py-3">Zone</th>
                        <th className="px-4 py-3">Team</th>
                        <th className="px-4 py-3">Scheduled</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Completed</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentAssignments.map((a) => {
                        const m = meterById.get(a.meter_id);
                        return (
                          <tr key={a.id} className="border-t border-border">
                            <td className="px-4 py-3 font-semibold text-foreground">{a.assignment_number}</td>
                            <td className="px-4 py-3 text-muted-foreground">{m?.meter_number ?? "—"}</td>
                            <td className="px-4 py-3 text-muted-foreground">{m?.resident_name ?? "—"}</td>
                            <td className="px-4 py-3 text-muted-foreground">{m?.zone_name ?? "—"}</td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {a.team_id ? (teamById.get(a.team_id)?.name ?? "—") : "—"}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {formatDate(a.scheduled_date)} {a.scheduled_time ?? ""}
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge value={a.status} />
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{formatDate(a.completed_at)}</td>
                            <td className="px-4 py-3 text-right">
                              {a.team_id ? (
                                <Link
                                  to="/vendor/teams/$teamId"
                                  params={{ teamId: a.team_id }}
                                  className="btn-outline px-3 py-1 text-xs"
                                >
                                  Manage
                                </Link>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <Pagination
                    page={page}
                    pageCount={pageCount}
                    onPage={setPage}
                    total={filteredAssignments.length}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {creating && (
        <VendorModal title={editing ? "Edit team" : "New installation team"} onClose={() => setCreating(false)}>
          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase text-muted-foreground">
              Team name
              <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold uppercase text-muted-foreground">
                Team leader
                <input className="input mt-1" value={leader} onChange={(e) => setLeader(e.target.value)} />
              </label>
              <label className="block text-xs font-semibold uppercase text-muted-foreground">
                Phone
                <input className="input mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </label>
            </div>
            <label className="block text-xs font-semibold uppercase text-muted-foreground">
              Description
              <textarea
                className="input mt-1"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="block text-xs font-semibold uppercase text-muted-foreground">
              Status
              <select
                className="input mt-1"
                value={status}
                onChange={(e) => setStatus(e.target.value as "active" | "inactive")}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-outline px-3 py-1.5 text-sm" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button
                className="btn-primary px-3 py-1.5 text-sm"
                disabled={name.trim().length < 2 || teamMutation.isPending}
                onClick={() => teamMutation.mutate()}
              >
                {teamMutation.isPending ? "Saving…" : "Save team"}
              </button>
            </div>
          </div>
        </VendorModal>
      )}

      {scheduling && (
        <VendorModal title="Schedule installation" onClose={() => setScheduling(false)}>
          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase text-muted-foreground">
              Meter
              <select className="input mt-1" value={meterId} onChange={(e) => setMeterId(e.target.value)}>
                <option value="">Select a meter</option>
                {meters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.meter_number} — {m.resident_name ?? "unassigned"} ({m.zone_name ?? "no zone"})
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold uppercase text-muted-foreground">
              Team
              <select className="input mt-1" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                <option value="">Select a team</option>
                {teams
                  .filter((t) => t.status === "active")
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold uppercase text-muted-foreground">
                Date
                <input className="input mt-1" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className="block text-xs font-semibold uppercase text-muted-foreground">
                Time
                <input className="input mt-1" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </label>
            </div>
            <label className="block text-xs font-semibold uppercase text-muted-foreground">
              Location
              <input className="input mt-1" value={location} onChange={(e) => setLocation(e.target.value)} />
            </label>
            <label className="block text-xs font-semibold uppercase text-muted-foreground">
              Notes
              <textarea className="input mt-1" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-outline px-3 py-1.5 text-sm" onClick={() => setScheduling(false)}>
                Cancel
              </button>
              <button
                className="btn-primary px-3 py-1.5 text-sm"
                disabled={!meterId || !teamId || !date || scheduleMutation.isPending}
                onClick={() => scheduleMutation.mutate()}
              >
                {scheduleMutation.isPending ? "Scheduling…" : "Schedule"}
              </button>
            </div>
          </div>
        </VendorModal>
      )}
    </DashboardShell>
  );
}
