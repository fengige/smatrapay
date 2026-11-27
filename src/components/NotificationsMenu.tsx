import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications.functions";
import { recentNotifications } from "@/lib/notification-menu";

function notificationTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown date"
    : date.toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });
}

export function NotificationsMenu({
  queryKey,
  notificationsPath,
  mobile = false,
}: {
  queryKey: string[];
  notificationsPath?: "/vendor/notifications" | "/resident/notifications" | undefined;
  mobile?: boolean;
}) {
  const queryClient = useQueryClient();
  const fetchNotifications = useServerFn(listNotifications);
  const markOne = useServerFn(markNotificationRead);
  const markAll = useServerFn(markAllNotificationsRead);
  const query = useQuery({
    queryKey,
    queryFn: () => fetchNotifications(),
    refetchInterval: 60_000,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey });
  const readOne = useMutation({
    mutationFn: (id: string) => markOne({ data: { id } }),
    onSuccess: invalidate,
  });
  const readAll = useMutation({
    mutationFn: () => markAll(),
    onSuccess: invalidate,
  });

  const unread = query.data?.unread ?? 0;
  const recent = recentNotifications(query.data?.notifications ?? []);
  const mutationError = readOne.error ?? readAll.error;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
          className={
            mobile
              ? "relative size-11"
              : "relative hidden size-9 rounded-full border border-border text-muted-foreground hover:text-foreground sm:inline-flex"
          }
        >
          <Bell className="size-4" />
          {unread > 0 && (
            mobile ? (
              <span className="absolute right-1 top-1 size-2 rounded-full bg-primary" />
            ) : (
              <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.6rem] font-bold leading-4 text-destructive-foreground">
                {unread > 99 ? "99+" : unread}
              </span>
            )
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="notif-wash w-[min(24rem,calc(100vw-1rem))] overflow-hidden border-primary/20 p-0"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Recent notifications</p>
            <p className="text-xs text-muted-foreground">
              {unread ? `${unread} unread` : "You're all caught up"}
            </p>
          </div>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              disabled={readAll.isPending}
              onClick={() => readAll.mutate()}
            >
              {readAll.isPending ? <Loader2 className="animate-spin" /> : <CheckCheck />}
              Mark all read
            </Button>
          )}
        </div>
        <DropdownMenuSeparator className="m-0" />
        {mutationError && (
          <p role="alert" className="px-4 py-2 text-xs text-destructive">
            Could not update notifications. Please try again.
          </p>
        )}
        {query.isPending ? (
          <div role="status" className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading notifications…
          </div>
        ) : query.error ? (
          <div role="alert" className="space-y-3 px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">Could not load notifications.</p>
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </div>
        ) : recent.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No notifications yet.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto py-1">
            {recent.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className="block cursor-pointer whitespace-normal px-4 py-3 focus:bg-primary/10"
                onSelect={() => {
                  if (!notification.read_at) readOne.mutate(notification.id);
                }}
              >
                <span className="flex items-start gap-3">
                  <span
                    aria-label={notification.read_at ? "Read" : "Unread"}
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${notification.read_at ? "bg-muted" : "bg-primary"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${notification.read_at ? "text-muted-foreground" : "font-semibold text-foreground"}`}>
                      {notification.title}
                    </span>
                    {notification.message && (
                      <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                        {notification.message}
                      </span>
                    )}
                    <span className="mt-1 block text-[0.7rem] text-muted-foreground">
                      {notificationTime(notification.created_at)}
                    </span>
                  </span>
                </span>
              </DropdownMenuItem>
            ))}
          </div>
        )}
        {notificationsPath && (
          <>
            <DropdownMenuSeparator className="m-0" />
            <DropdownMenuItem asChild className="cursor-pointer justify-center rounded-none px-4 py-3 text-sm font-semibold text-primary">
              <Link to={notificationsPath}>View all notifications</Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
