import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/notifications.functions";
import { Card, Empty, residentHead, when } from "@/components/resident/ResidentUI";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/resident/notifications")({
  head: residentHead("My Notifications", "Payment, token and maintenance updates for your account."),
  loader: () => checkRoleAccess({ data: { role: "resident" } }),
  component: Page,
  errorComponent: () => <p className="p-8 text-sm">Could not load notifications.</p>,
});

function Page() {
  const access = Route.useLoaderData();
  const listFn = useServerFn(listNotifications);
  const readFn = useServerFn(markNotificationRead);
  const allFn = useServerFn(markAllNotificationsRead);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["resident-notifications"], queryFn: () => listFn(), enabled: access.allowed });
  const done = () => qc.invalidateQueries({ queryKey: ["resident-notifications"] });
  const one = useMutation({ mutationFn: (id: string) => readFn({ data: { id } }), onSuccess: done });
  const all = useMutation({ mutationFn: () => allFn(), onSuccess: done });
  return (
    <DashboardShell access={access} title="My Notifications" description={q.data ? `${q.data.unread} unread` : ""}
      actions={q.data?.unread ? <button className="btn-outline px-4" onClick={() => all.mutate()}>Mark all read</button> : undefined}>
      <Card>
        {q.isPending ? <p role="status" className="text-sm text-muted-foreground">Loading notifications…</p> : q.error ? <div role="alert"><p className="text-sm text-destructive">Could not load notifications.</p><Button variant="outline" onClick={() => void q.refetch()}>Try again</Button></div> : (q.data?.notifications ?? []).length === 0 ? <Empty>No notifications yet.</Empty> : (
          <ul className="divide-y divide-border">
            {(q.data?.notifications ?? []).map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-4 py-3 text-sm">
                <div>
                  <p className={n.read_at ? "text-muted-foreground" : "font-semibold text-foreground"}>{n.title}</p>
                  {n.message && <p className="text-muted-foreground">{n.message}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">{when(n.created_at)}</p>
                </div>
                {!n.read_at && <button className="shrink-0 text-xs text-primary" onClick={() => one.mutate(n.id)}>Mark read</button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </DashboardShell>
  );
}
