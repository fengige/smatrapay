import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { getVendorDirectory } from "@/lib/vendor-admin.functions";
import {
  downloadCsv,
  EmptyState,
  ErrorBlock,
  formatDate,
  LoadingBlock,
  Pagination,
  StatCard,
  StatusBadge,
  titleCase,
} from "@/components/vendor/VendorUI";

export const Route = createFileRoute("/_authenticated/vendor/properties")({
  head: () => ({
    meta: [
      { title: "Property Management · Vendor · SmatraPay" },
      { name: "description", content: "Properties where your meters are installed, with unit and resident counts." },
      { property: "og:title", content: "Property Management · Vendor · SmatraPay" },
      { property: "og:description", content: "Buildings served by the meters registered to your account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorProperties,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{error.message}</p>,
});

const PAGE_SIZE = 10;

function VendorProperties() {
  const access = Route.useLoaderData();
  const fetchDirectory = useServerFn(getVendorDirectory);
  const { data, isLoading, error } = useQuery({
    queryKey: ["vendor-directory"],
    queryFn: () => fetchDirectory(),
  });
  const [q, setQ] = useState("");
  const [zone, setZone] = useState("all");
  const [page, setPage] = useState(1);

  const properties = data?.properties ?? [];
  const zones = useMemo(
    () => [...new Set(properties.map((p) => p.zone_name).filter(Boolean))] as string[],
    [properties],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return properties.filter((p) => {
      if (zone !== "all" && p.zone_name !== zone) return false;
      if (!needle) return true;
      return [p.name, p.code, p.city, p.owner_name].some((v) =>
        (v ?? "").toLowerCase().includes(needle),
      );
    });
  }, [properties, q, zone]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <DashboardShell
      access={access}
      title="Property management"
      description="Properties served by the meters registered to you."
    >
      {error ? (
        <ErrorBlock message={(error as Error).message} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : properties.length === 0 ? (
        <EmptyState title="No properties" message="None of your meters are linked to a property yet." />
      ) : (
        <div className="space-y-4 pb-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Properties" value={properties.length} />
            <StatCard label="Units with your meters" value={properties.reduce((s, p) => s + p.unit_count, 0)} />
            <StatCard label="Residents" value={properties.reduce((s, p) => s + p.resident_count, 0)} />
            <StatCard label="Meters" value={properties.reduce((s, p) => s + p.meter_count, 0)} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-w-56 flex-1 items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm">
              <Search className="size-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="Search property, code, city or owner"
                aria-label="Search properties"
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
            </label>
            <select
              value={zone}
              onChange={(e) => {
                setZone(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by zone"
              className="rounded-full border border-border bg-card px-4 py-2 text-sm"
            >
              <option value="all">All zones</option>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
            <button
              className="btn-outline px-4 py-2 text-sm"
              onClick={() =>
                downloadCsv(
                  "vendor-properties.csv",
                  ["Property", "Code", "Type", "Zone", "City", "Owner", "Owner type", "Units", "Meters", "Residents", "Status"],
                  rows.map((p) => [
                    p.name,
                    p.code ?? "",
                    p.property_type ?? "",
                    p.zone_name ?? "",
                    p.city ?? "",
                    p.owner_name ?? "",
                    p.owner_type,
                    p.unit_count,
                    p.meter_count,
                    p.resident_count,
                    p.status,
                  ]),
                )
              }
            >
              Export CSV
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Property</th>
                  <th className="px-4 py-2">Zone</th>
                  <th className="px-4 py-2">City</th>
                  <th className="px-4 py-2">Owner</th>
                  <th className="px-4 py-2">Units</th>
                  <th className="px-4 py-2">Meters</th>
                  <th className="px-4 py-2">Residents</th>
                  <th className="px-4 py-2">Added</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {current.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-4 py-2">
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.code ?? p.property_type ?? "—"}</p>
                    </td>
                    <td className="px-4 py-2">{p.zone_name ?? "—"}</td>
                    <td className="px-4 py-2">{p.city ?? "—"}</td>
                    <td className="px-4 py-2">
                      <p>{p.owner_name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{titleCase(p.owner_type)}</p>
                    </td>
                    <td className="px-4 py-2">{p.unit_count}</td>
                    <td className="px-4 py-2">{p.meter_count}</td>
                    <td className="px-4 py-2">{p.resident_count}</td>
                    <td className="px-4 py-2">{formatDate(p.created_at)}</td>
                    <td className="px-4 py-2">
                      <StatusBadge value={p.status} />
                    </td>
                  </tr>
                ))}
                {current.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                      No properties match these filters.
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
