import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import {
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  Pagination,
  StatusBadge,
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
  const { data, isLoading, error } = useVendorScope();
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

  return (
    <DashboardShell
      access={access}
      title="Zone management"
      description="Zones covered by the meters assigned to you."
    >
      {error ? (
        <ErrorBlock message={(error as Error).message} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : zones.length === 0 ? (
        <EmptyState title="No zones" message="No zones have been assigned to your vendor account yet." />
      ) : (
        <div className="space-y-4 pb-6">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-w-56 flex-1 items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm">
              <Search className="size-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="Search zone, region or city"
                aria-label="Search zones"
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
            </label>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by status"
              className="rounded-full border border-border bg-card px-4 py-2 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Zone</th>
                  <th className="px-4 py-2">Region</th>
                  <th className="px-4 py-2">City</th>
                  <th className="px-4 py-2">Residents</th>
                  <th className="px-4 py-2">Meters</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {current.map((z) => (
                  <tr key={z.zone_id} className="border-t border-border">
                    <td className="px-4 py-2 font-semibold">{z.zone_name}</td>
                    <td className="px-4 py-2">{z.region ?? "—"}</td>
                    <td className="px-4 py-2">{z.city ?? "—"}</td>
                    <td className="px-4 py-2">{z.resident_count}</td>
                    <td className="px-4 py-2">{z.meter_count}</td>
                    <td className="px-4 py-2">
                      <StatusBadge value={z.status} />
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        to="/vendor/zones/$zoneId"
                        params={{ zoneId: String(z.zone_id) }}
                        className="text-xs font-semibold text-primary"
                      >
                        View details
                      </Link>
                    </td>
                  </tr>
                ))}
                {current.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      No zones match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageCount={pageCount} onPage={setPage} total={rows.length} />
        </div>
      )}
    </DashboardShell>
  );
}
