import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImageIcon, Loader2 } from "lucide-react";

import { listProfileImageAudit, type ProfileImageAuditEntry } from "@/lib/profile-audit.functions";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";

const LABELS: Record<string, string> = {
  profile_image_uploaded: "Photo uploaded",
  profile_image_updated: "Photo changed",
  profile_image_removed: "Photo removed",
};

/** Audit trail of profile photo uploads, changes and removals. */
export function ProfileImageHistory({ userId }: { userId: string }) {
  const fetchAudit = useServerFn(listProfileImageAudit);
  const queryKey = ["profile-image-audit", userId];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      (fetchAudit as unknown as (o: { data: unknown }) => Promise<{ entries: ProfileImageAuditEntry[] }>)({
        data: { userId, limit: 20 },
      }),
  });

  useRealtimeRefresh("profile-image-audit", ["user_audit_logs"], [queryKey]);

  const entries = data?.entries ?? [];

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <ImageIcon className="size-4 text-primary" />
        <h4 className="text-sm font-bold text-foreground">Profile photo history</h4>
        {isLoading ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
      </header>
      {entries.length === 0 && !isLoading ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">
          No profile photo changes recorded yet.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-4 py-3">
              {e.to ? (
                <img src={e.to} alt="" className="size-8 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <ImageIcon className="size-4" />
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-foreground">
                  {LABELS[e.action] ?? e.action}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  by {e.actor_name} · {new Date(e.created_at).toLocaleString()}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
