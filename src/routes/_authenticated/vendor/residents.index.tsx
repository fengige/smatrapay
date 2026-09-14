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
  formatDate,
  installationLabel,
  titleCase,
  useVendorScope,
} from "@/components/vendor/VendorUI";

export const Route = createFileRoute("/_authenticated/vendor/residents/")({
  head: () => ({
    meta: [
      { title: "Resident Management · Vendor · SmatraPay" },
      {
        name: "description",
        content: "Residents living in the zones served by your vendor account.",
      },
      { property: "og:title", content: "Resident Management · Vendor · SmatraPay" },
      {
        property: "og:description",
        content: "Look up residents, their units and the meters serving them.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorResidentsPage,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{error.message}</p>,
});

const PAGE_SIZE = 10;

function VendorResidentsPage() {
  const access = Route.useLoaderData();
  const { data, isLoading, error } = useVendorScope();
  const [q, setQ] = useState("");
  const [zone, setZone] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  const residents = data?.residents ?? [];
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return residents.filter((r) => {
      if (zone !== "all" && String(r.zone_id ?? "") !== zone) return false;
      if (status !== "all" && r.status !== status) return false;
      if (!needle) return true;
      return [r.name, r.email, r.phone, r.meter_number, r.unit_label, r.property_name].some((v) =>
        (v ?? "").toLowerCase().includes(needle),
      );
    });
  }, [residents, q, zone, status]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <DashboardShell
      access={access}
      title="Resident management"
      description={`Residents in your zones: ${new Set(residents.map((r) => r.id)).size}`}
    >
      {error ? (
        <ErrorBlock message={(error as Error).message} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : residents.length === 0 ? (
        <EmptyState
          title="No residents"
          message="No residents are currently associated with your assigned zones."
        />
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
                placeholder="Search resident, phone, meter"
                aria-label="Search residents"
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
            </label>
            <select
              aria-label="Filter by zone"
              value={zone}
              onChange={(e) => {
                setZone(e.target.value);
                setPage(1);
              }}
              className="rounded-full border border-border bg-card px-4 py-2 text-sm"
            >
              <option value="all">All zones</option>
              {(data?.zones ?? []).map((z) => (
                <option key={z.zone_id} value={String(z.zone_id)}>
                  {z.zone_name}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by account status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="rounded-full border border-border bg-card px-4 py-2 text-sm"
            >
              <option value="all">All accounts</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Resident</th>
                  <th className="px-3 py-2">Phone</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Zone</th>
                  <th className="px-3 py-2">Property / unit</th>
                  <th className="px-3 py-2">Meter</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2">Meter status</th>
                  <th className="px-3 py-2">Installation</th>
                  <th className="px-3 py-2">Registered</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {current.map((r) => (
                  <tr key={`${r.id}-${r.unit_id}`} className="border-t border-border">
                    <td className="px-3 py-2 font-semibold">{r.name ?? r.email ?? "—"}</td>
                    <td className="px-3 py-2">{r.phone ?? "—"}</td>
                    <td className="px-3 py-2">{r.email ?? "—"}</td>
                    <td className="px-3 py-2">{r.zone_name ?? "—"}</td>
                    <td className="px-3 py-2">
                      {r.property_name ?? "—"}
                      {r.unit_label ? ` · ${r.unit_label}` : ""}
                    </td>
                    <td className="px-3 py-2">{r.meter_number ?? "—"}</td>
                    <td className="px-3 py-2">{titleCase(r.meter_type)}</td>
                    <td className="px-3 py-2">
                      <StatusBadge value={r.status} />
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge value={r.meter_status} />
                    </td>
                    <td className="px-3 py-2">{installationLabel(r.installation_status)}</td>
                    <td className="px-3 py-2">{formatDate(r.created_at)}</td>
                    <td className="px-3 py-2">
                      <span className="flex gap-2 whitespace-nowrap">
                        <Link
                          to="/vendor/residents/$residentId"
                          params={{ residentId: r.id }}
                          className="text-xs font-semibold text-primary"
                        >
                          View
                        </Link>
                        {r.zone_id != null && (
                          <Link
                            to="/vendor/zones/$zoneId"
                            params={{ zoneId: String(r.zone_id) }}
                            className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                          >
                            Zone
                          </Link>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
                {current.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-4 py-8 text-center text-muted-foreground">
                      No residents match these filters.
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
