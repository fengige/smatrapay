import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History, Loader2, Search } from "lucide-react";

import { listZoneAuditLogs, type ZoneAuditRow } from "@/lib/zones.functions";

const actionClass: Record<string, string> = {
  created: "bg-emerald-500/10 text-emerald-600",
  updated: "bg-amber-500/10 text-amber-600",
  deleted: "bg-destructive/10 text-destructive",
};

function describe(log: ZoneAuditRow) {
  const parts = Object.entries(log.changes ?? {}).map(([field, change]) => {
    const oldValue = change?.old == null || change.old === "" ? "—" : String(change.old);
    const newValue = change?.new == null || change.new === "" ? "—" : String(change.new);
    const label = field === "zone_name" ? "Name" : "Description";
    if (log.action === "created") return `${label}: ${newValue}`;
    if (log.action === "deleted") return `${label}: ${oldValue}`;
    return `${label}: ${oldValue} → ${newValue}`;
  });
  return parts.length ? parts.join(" · ") : "No field changes recorded";
}

export function ZoneAuditViewer({ zoneId }: { zoneId?: number }) {
  const fetchLogs = useServerFn(listZoneAuditLogs);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["zone-audit-logs", zoneId ?? null],
    queryFn: () =>
      fetchLogs({ data: { zone_id: zoneId ?? null } } as never) as Promise<{
        logs: ZoneAuditRow[];
      }>,
  });

  const logs = (data?.logs ?? []) as ZoneAuditRow[];
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return logs.filter((l) => {
      if (action !== "all" && l.action !== action) return false;
      if (!needle) return true;
      return [l.zone_name ?? "", l.actor_name, describe(l)]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [logs, q, action]);

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Zone activity log</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search activity"
              aria-label="Search zone activity"
              className="h-9 w-56 rounded-lg border border-border bg-background pl-8 pr-3 text-xs"
            />
          </div>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            aria-label="Filter by action"
            className="h-9 rounded-lg border border-border bg-background px-2 text-xs"
          >
            <option value="all">All actions</option>
            <option value="created">Created</option>
            <option value="updated">Updated</option>
            <option value="deleted">Deleted</option>
          </select>
        </div>
      </div>

      <div className="mt-4">
        {isLoading && <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />}
        {!isLoading && !rows.length && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No zone activity recorded yet.
          </p>
        )}
        <ul className="space-y-3">
          {rows.map((l) => (
            <li key={l.id} className="rounded-xl border border-border/70 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    actionClass[l.action] ?? "bg-muted text-muted-foreground"
                  }`}
                >
                  {l.action}
                </span>
                <span className="text-sm font-medium">{l.zone_name ?? `Zone #${l.zone_id}`}</span>
                <span className="text-xs text-muted-foreground">
                  by {l.actor_name} · {new Date(l.created_at).toLocaleString()}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{describe(l)}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
