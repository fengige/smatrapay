import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications.functions";
import { EmptyState, ErrorBlock, LoadingBlock, formatDate } from "@/components/vendor/VendorUI";

export const Route = createFileRoute("/_authenticated/vendor/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications · Vendor · SmatraPay" },
      {
        name: "description",
        content: "Alerts about meters, zones, residents and assignments on your vendor account.",
      },
      { property: "og:title", content: "Notifications · Vendor · SmatraPay" },
      {
        property: "og:description",
        content: "Stay on top of meter and resident activity for your vendor account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorNotifications,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{error.message}</p>,
});

function VendorNotifications() {
  const access = Route.useLoaderData();
  const queryClient = useQueryClient();
  const fetchAll = useServerFn(listNotifications);
  const markOne = useServerFn(markNotificationRead);
  const markAll = useServerFn(markAllNotificationsRead);

  const { data, isLoading, error } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchAll(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });

  const readOne = useMutation({
    mutationFn: (id: string) => markOne({ data: { id } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });
  const readAll = useMutation({
    mutationFn: () => markAll(),
    onSuccess: async () => {
      await invalidate();
      toast.success("All notifications marked as read");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const notifications = data?.notifications ?? [];

  return (
    <DashboardShell
      access={access}
      title="Notifications"
      description="Activity on your vendor account."
      actions={
        <button
          className="btn-outline px-3 py-1.5 text-sm"
          disabled={!data?.unread || readAll.isPending}
          onClick={() => readAll.mutate()}
        >
          Mark all read
        </button>
      }
    >
      {error ? (
        <ErrorBlock message={(error as Error).message} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : notifications.length === 0 ? (
        <EmptyState title="No notifications" message="You have no notifications yet." />
      ) : (
        <ul className="space-y-2 pb-6">
          {notifications.map((n) => (
            <li
              key={n.id}
              className={`flex items-start gap-3 rounded-2xl border p-4 ${
                n.read_at ? "border-border bg-card" : "border-primary/30 bg-primary/5"
              }`}
            >
              <Bell className="mt-0.5 size-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{n.title}</p>
                {n.message && <p className="text-sm text-muted-foreground">{n.message}</p>}
                <p className="mt-1 text-xs text-muted-foreground">{formatDate(n.created_at)}</p>
              </div>
              {!n.read_at && (
                <button
                  className="btn-outline px-3 py-1 text-xs"
                  onClick={() => readOne.mutate(n.id)}
                  disabled={readOne.isPending}
                >
                  Mark read
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </DashboardShell>
  );
}
