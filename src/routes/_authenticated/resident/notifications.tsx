import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/notifications.functions";
import { Card, Empty, residentHead, when } from "@/components/resident/ResidentUI";
import { Button } from "@/components/ui/button";
import { residentNotificationTarget } from "@/lib/resident-mobile";
import { useResidentConnection } from "@/components/resident/ResidentMobileChrome";

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
  const online = useResidentConnection();
  const q = useQuery({ queryKey: ["resident-notifications"], queryFn: () => listFn(), enabled: access.allowed });
  const done = () => qc.invalidateQueries({ queryKey: ["resident-notifications"] });
  const one = useMutation({ mutationFn: (id: string) => readFn({ data: { id } }), onSuccess: done });
  const all = useMutation({ mutationFn: () => allFn(), onSuccess: done });
  return (
    <DashboardShell access={access} title="My Notifications" description={q.data ? `${q.data.unread} unread` : ""}
      actions={q.data?.unread ? <Button variant="outline" className="min-h-11" disabled={!online || all.isPending || one.isPending} onClick={() => all.mutate()}>Mark all read</Button> : undefined}>
      {(one.error || all.error) && <p role="alert" className="mb-3 text-sm text-destructive">Could not mark notifications as read. Reconnect and try again.</p>}
      <Card>
        {q.isPending ? <p role="status" className="text-sm text-muted-foreground">Loading notifications…</p> : q.error ? <div role="alert"><p className="text-sm text-destructive">Could not load notifications.</p><Button variant="outline" onClick={() => void q.refetch()}>Try again</Button></div> : (q.data?.notifications ?? []).length === 0 ? <Empty>No notifications yet.</Empty> : (
          <ul className="divide-y divide-border">
            {(q.data?.notifications ?? []).map((n) => {
              const target = residentNotificationTarget(n.resource_type, n.resource_id);
              return <li key={n.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 py-3 text-sm">
                <div className="min-w-0 break-words">
                  <p className={n.read_at ? "text-muted-foreground" : "font-semibold text-foreground"}>{n.title}</p>
                  {n.message && <p className="text-muted-foreground">{n.message}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">{when(n.created_at)}</p>
                  {target && <Button asChild variant="link" className="min-h-11 px-0"><Link {...target} onClick={() => { if (online && !n.read_at && !one.isPending) one.mutate(n.id); }}>View {n.resource_type === "service_request" ? "request" : "purchase"}</Link></Button>}
                </div>
                {!n.read_at && <Button variant="ghost" className="min-h-11 shrink-0 px-2 text-xs" disabled={!online || one.isPending || all.isPending} onClick={() => one.mutate(n.id)}>Mark read</Button>}
              </li>;
            })}
          </ul>
        )}
      </Card>
    </DashboardShell>
  );
}
