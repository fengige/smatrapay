import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  History,
  Loader2,
  Search,
} from "lucide-react";

import type { AssignmentHistoryPage } from "@/lib/assignment-history";
import { listAgentAssignmentHistory } from "@/lib/agents.functions";
import { listVendorAssignmentHistory } from "@/lib/vendors.functions";
import { listLandlordAssignmentHistory } from "@/lib/landlords.functions";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";

type Kind = "agent" | "vendor" | "landlord";
type SortBy = "created_at" | "meter_number" | "action" | "actor_name";

const SORTS: { key: SortBy; label: string }[] = [
  { key: "created_at", label: "Date" },
  { key: "meter_number", label: "Meter" },
  { key: "action", label: "Action" },
  { key: "actor_name", label: "Changed by" },
];

/** Paginated, sortable and searchable meter assignment history for a holder. */
export function AssignmentHistorySection({ kind, ownerId }: { kind: Kind; ownerId: string }) {
  const fn = useServerFn(
    kind === "agent"
      ? listAgentAssignmentHistory
      : kind === "vendor"
        ? (listVendorAssignmentHistory as never)
        : (listLandlordAssignmentHistory as never),
  );

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState<SortBy>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [action, setAction] = useState<"all" | "assigned" | "unassigned">("all");

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search, action, pageSize, sortBy, sortDir]);

  const ownerArg =
    kind === "agent"
      ? { agentId: ownerId }
      : kind === "vendor"
        ? { vendorId: ownerId }
        : { landlordId: ownerId };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [`${kind}-assignment-history`, ownerId, page, pageSize, sortBy, sortDir, search, action],
    queryFn: () =>
      (fn as unknown as (o: { data: unknown }) => Promise<AssignmentHistoryPage>)({
        data: { ...ownerArg, page, pageSize, sortBy, sortDir, search: search || undefined, action },
      }),
  });

  useRealtimeRefresh(`${kind}-assignment-history`, ["meters", "meter_audit_logs"], [
    [`${kind}-assignment-history`, ownerId],
  ]);

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const pageCount = data?.pageCount ?? 1;

  const toggleSort = (key: SortBy) => {
    if (key === sortBy) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortDir(key === "created_at" ? "desc" : "asc");
    }
  };

  return (
    <div className="border-t border-border">
      <header className="flex flex-wrap items-center gap-2 px-6 py-4">
        <History className="size-4 text-primary" />
        <h4 className="text-sm font-bold text-foreground">Assignment history</h4>
        <span className="text-xs text-muted-foreground">
          {total} event{total === 1 ? "" : "s"}
        </span>
        {isFetching && !isLoading && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
      </header>

      <div className="flex flex-wrap items-end gap-3 px-6 pb-4">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Meter, serial or person…"
            aria-label="Search assignment history"
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value as typeof action)}
          aria-label="Filter by action"
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="all">All actions</option>
          <option value="assigned">Assigned</option>
          <option value="unassigned">Unassigned</option>
        </select>
        <select
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          aria-label="Rows per page"
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          {[10, 25, 50].map((n) => (
            <option key={n} value={n}>
              {n} per page
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-6 pb-3">
        <span className="text-xs font-medium text-muted-foreground">Sort by</span>
        {SORTS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => toggleSort(s.key)}
            aria-pressed={sortBy === s.key}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
              sortBy === s.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-accent/10"
            }`}
          >
            {s.label}
            {sortBy === s.key &&
              (sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center pb-8 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <p className="px-6 pb-6 text-xs text-muted-foreground">
          {search || action !== "all"
            ? "No events match your filters."
            : "No meter registrations or removals recorded yet."}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-border border-t border-border">
            {entries.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-6 py-3">
                <div className="text-sm">
                  <span
                    className={
                      h.action === "assigned"
                        ? "mr-2 rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase text-emerald-600"
                        : "mr-2 rounded bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold uppercase text-destructive"
                    }
                  >
                    {h.action}
                  </span>
                  <span className="font-medium text-foreground">{h.meter_number}</span>
                  {h.serial_number && (
                    <span className="ml-2 text-xs text-muted-foreground">{h.serial_number}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {h.actor_name} · {new Date(h.created_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-3">
            <p className="text-xs text-muted-foreground">
              Page {data?.page ?? page} of {pageCount}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={(data?.page ?? page) <= 1}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent/10 disabled:opacity-50"
              >
                <ChevronLeft className="size-3.5" /> Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={(data?.page ?? page) >= pageCount}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent/10 disabled:opacity-50"
              >
                Next <ChevronRight className="size-3.5" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
