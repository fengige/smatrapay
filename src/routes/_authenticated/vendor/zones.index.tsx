import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Eye,
  Gauge,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";

import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import {
  ErrorBlock,
  Pagination,
  StatusBadge,
  downloadCsv,
  useVendorScope,
} from "@/components/vendor/VendorUI";

export const Route = createFileRoute("/_authenticated/vendor/zones/")({
  head: () => ({
    meta: [
      { title: "Zone Management · Vendor · SmatraPay" },
      {
        name: "description",
        content: "Zones assigned to your vendor account, with resident and meter counts.",
      },
      { property: "og:title", content: "Zone Management · Vendor · SmatraPay" },
      {
        property: "og:description",
        content: "Review the zones you serve and drill into their residents and meters.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorZonesPage,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{error.message}</p>,
});

const PAGE_SIZE = 10;

function VendorZonesPage() {
  const access = Route.useLoaderData();
  const { data, isLoading, isFetching, error, refetch } = useVendorScope();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  const zones = data?.zones ?? [];
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return zones.filter((z) => {
      if (status !== "all" && z.status !== status) return false;
      if (!needle) return true;
      return [z.zone_name, z.region, z.city].some((v) => (v ?? "").toLowerCase().includes(needle));
    });
  }, [zones, q, status]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const activeZones = zones.filter((z) => z.status === "Active").length;
  const totalResidents = zones.reduce((sum, z) => sum + (z.resident_count ?? 0), 0);
  const totalMeters = zones.reduce((sum, z) => sum + (z.meter_count ?? 0), 0);

  const exportCsv = () =>
    downloadCsv(
      "vendor-zones.csv",
      rows.map((z) => ({
        zone_id: z.zone_id,
        zone_name: z.zone_name,
        region: z.region ?? "",
        city: z.city ?? "",
        residents: z.resident_count,
        meters: z.meter_count,
        status: z.status,
      })),
    );

  return (
    <DashboardShell
      access={access}
      title="Zone Management"
      description="Zones covered by the meters assigned to your vendor account"
    >
      <div className="space-y-6 pb-6">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            aria-label="Refresh zones"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10"
          >
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Total zones" value={zones.length} icon={MapPin} tone="text-primary" />
          <SummaryCard
            label="Active zones"
            value={activeZones}
            icon={CheckCircle2}
            tone="text-emerald-600"
          />
          <SummaryCard
            label="Residents"
            value={totalResidents}
            icon={Users}
            tone="text-muted-foreground"
          />
          <SummaryCard
            label="Meters"
            value={totalMeters}
            icon={Gauge}
            tone="text-muted-foreground"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search zone, region or city"
              aria-label="Search zones"
              className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm"
            />
          </div>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by status"
            className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>

        {error ? (
          <ErrorBlock message={(error as Error).message} />
        ) : (
          <>
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Zone</th>
                    <th className="px-4 py-3 text-left">Region</th>
                    <th className="px-4 py-3 text-left">City</th>
                    <th className="px-4 py-3 text-left">Residents</th>
                    <th className="px-4 py-3 text-left">Meters</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                        <Loader2 className="mx-auto size-5 animate-spin" />
                      </td>
                    </tr>
                  )}
                  {!isLoading && current.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                        {zones.length === 0
                          ? "No zones have been assigned to your vendor account yet."
                          : "No zones match your search."}
                      </td>
                    </tr>
                  )}
                  {current.map((z) => (
                    <tr key={z.zone_id} className="border-t border-border/70">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{z.zone_name}</div>
                        <div className="text-xs text-muted-foreground">Zone #{z.zone_id}</div>
                      </td>
                      <td className="px-4 py-3">{z.region ?? "—"}</td>
                      <td className="px-4 py-3">{z.city ?? "—"}</td>
                      <td className="px-4 py-3">{z.resident_count}</td>
                      <td className="px-4 py-3">{z.meter_count}</td>
                      <td className="px-4 py-3">
                        <StatusBadge value={z.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <Link
                            to="/vendor/zones/$zoneId"
                            params={{ zoneId: String(z.zone_id) }}
                            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent/10"
                          >
                            <Eye className="size-3.5" /> View
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-muted-foreground">
              Zones are created and edited by administrators. You see only the zones covered by the
              meters assigned to your vendor account.
            </p>

            <Pagination page={page} pageCount={pageCount} onPage={setPage} total={rows.length} />
          </>
        )}
      </div>
    </DashboardShell>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className={`size-4 ${tone}`} />
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}
