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
  LoadingBlock,
  Pagination,
  StatCard,
  StatusBadge,
  titleCase,
} from "@/components/vendor/VendorUI";

export const Route = createFileRoute("/_authenticated/vendor/landlords")({
  head: () => ({
    meta: [
      { title: "Landlord Management · Vendor · SmatraPay" },
      { name: "description", content: "Property owners behind the meters registered to your account." },
      { property: "og:title", content: "Landlord Management · Vendor · SmatraPay" },
      { property: "og:description", content: "Owners of the properties where your meters are installed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorLandlords,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{error.message}</p>,
});

const PAGE_SIZE = 10;

function VendorLandlords() {
  const access = Route.useLoaderData();
  const fetchDirectory = useServerFn(getVendorDirectory);
  const { data, isLoading, error } = useQuery({
    queryKey: ["vendor-directory"],
    queryFn: () => fetchDirectory(),
  });
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [page, setPage] = useState(1);

  const owners = data?.owners ?? [];
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return owners.filter((o) => {
      if (type !== "all" && o.owner_type !== type) return false;
      if (!needle) return true;
      return [o.name, o.email, o.phone].some((v) => (v ?? "").toLowerCase().includes(needle));
    });
  }, [owners, q, type]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <DashboardShell
      access={access}
      title="Landlord management"
      description="Owners of the properties where your meters are installed."
    >
      {error ? (
        <ErrorBlock message={(error as Error).message} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : owners.length === 0 ? (
        <EmptyState
          title="No owners yet"
          message="No property owners are linked to your meters yet."
        />
      ) : (
        <div className="space-y-4 pb-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Owners" value={owners.length} />
            <StatCard label="Properties" value={owners.reduce((s, o) => s + o.property_count, 0)} />
            <StatCard label="Units" value={owners.reduce((s, o) => s + o.unit_count, 0)} />
            <StatCard label="Meters" value={owners.reduce((s, o) => s + o.meter_count, 0)} />
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
                placeholder="Search name, email or phone"
                aria-label="Search owners"
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
            </label>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by owner type"
              className="rounded-full border border-border bg-card px-4 py-2 text-sm"
            >
              <option value="all">All owner types</option>
              <option value="landlord">Landlord</option>
              <option value="agent">Agent</option>
              <option value="vendor">Vendor</option>
            </select>
            <button
              className="btn-outline px-4 py-2 text-sm"
              onClick={() =>
                downloadCsv(
                  "vendor-landlords.csv",
                  ["Name", "Type", "Email", "Phone", "Properties", "Units", "Meters", "Status"],
                  rows.map((o) => [
                    o.name ?? "",
                    o.owner_type,
                    o.email ?? "",
                    o.phone ?? "",
                    o.property_count,
                    o.unit_count,
                    o.meter_count,
                    o.status,
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
                  <th className="px-4 py-2">Owner</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Phone</th>
                  <th className="px-4 py-2">Properties</th>
                  <th className="px-4 py-2">Units</th>
                  <th className="px-4 py-2">Meters</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {current.map((o) => (
                  <tr key={o.id} className="border-t border-border">
                    <td className="px-4 py-2 font-semibold">{o.name ?? "—"}</td>
                    <td className="px-4 py-2">{titleCase(o.owner_type)}</td>
                    <td className="px-4 py-2">{o.email ?? "—"}</td>
                    <td className="px-4 py-2">{o.phone ?? "—"}</td>
                    <td className="px-4 py-2">{o.property_count}</td>
                    <td className="px-4 py-2">{o.unit_count}</td>
                    <td className="px-4 py-2">{o.meter_count}</td>
                    <td className="px-4 py-2">
                      <StatusBadge value={o.status} />
                    </td>
                  </tr>
                ))}
                {current.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                      No owners match these filters.
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
