import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpDown, Download, RefreshCw, Search } from "lucide-react";
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

const LIMIT_OPTIONS = [10, 25, 50, 100];

type SortKey =
  | "name"
  | "property_type"
  | "zone_name"
  | "city"
  | "owner_name"
  | "unit_count"
  | "meter_count"
  | "resident_count"
  | "created_at"
  | "status";

function VendorProperties() {
  const access = Route.useLoaderData();
  const fetchDirectory = useServerFn(getVendorDirectory);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["vendor-directory"],
    queryFn: () => fetchDirectory(),
  });
  const [q, setQ] = useState("");
  const [zone, setZone] = useState("all");
  const [propertyType, setPropertyType] = useState("all");
  const [status, setStatus] = useState("all");
  const [ownerType, setOwnerType] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const properties = data?.properties ?? [];
  const zones = useMemo(
    () => [...new Set(properties.map((p) => p.zone_name).filter(Boolean))] as string[],
    [properties],
  );

  const propertyTypes = useMemo(
    () => [...new Set(properties.map((p) => p.property_type).filter(Boolean))] as string[],
    [properties],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return properties.filter((p) => {
      if (zone !== "all" && p.zone_name !== zone) return false;
      if (propertyType !== "all" && p.property_type !== propertyType) return false;
      if (status !== "all" && p.status !== status) return false;
      if (ownerType !== "all" && p.owner_type !== ownerType) return false;
      if (!needle) return true;
      return [p.name, p.code, p.city, p.owner_name].some((v) =>
        (v ?? "").toLowerCase().includes(needle),
      );
    });
  }, [properties, q, zone, propertyType, status, ownerType]);

  const sortedRows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey];
      const bv = (b as Record<string, unknown>)[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const current = sortedRows.slice((page - 1) * pageSize, page * pageSize);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  };

  const SortHeader = ({ label, sortBy }: { label: string; sortBy: SortKey }) => (
    <th className="px-4 py-2">
      <button
        type="button"
        onClick={() => toggleSort(sortBy)}
        className="inline-flex items-center gap-1 uppercase hover:text-foreground"
      >
        {label}
        <ArrowUpDown className={`size-3 ${sortKey === sortBy ? "text-primary" : "opacity-40"}`} />
      </button>
    </th>
  );

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
            <select
              value={propertyType}
              onChange={(e) => {
                setPropertyType(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by property type"
              className="rounded-full border border-border bg-card px-4 py-2 text-sm"
            >
              <option value="all">All property types</option>
              {propertyTypes.map((t) => (
                <option key={t} value={t}>
                  {titleCase(t)}
                </option>
              ))}
            </select>
            <select
              value={ownerType}
              onChange={(e) => {
                setOwnerType(e.target.value);
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
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
            <button
              className="btn-outline px-4 py-2 text-sm"
              aria-label="Refresh properties"
              onClick={() => void refetch()}
            >
              <RefreshCw className={`inline size-3.5 ${isFetching ? "animate-spin" : ""}`} />
            </button>
            <button
              className="btn-outline px-4 py-2 text-sm"
              onClick={() =>
                downloadCsv(
                  "vendor-properties.csv",
                  ["Property", "Code", "Type", "Zone", "City", "Owner", "Owner type", "Units", "Meters", "Residents", "Status"],
                  sortedRows.map((p) => [
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
              <Download className="mr-1 inline size-3.5" /> Export CSV
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <SortHeader label="Property" sortBy="name" />
                  <SortHeader label="Zone" sortBy="zone_name" />
                  <SortHeader label="City" sortBy="city" />
                  <SortHeader label="Owner" sortBy="owner_name" />
                  <SortHeader label="Units" sortBy="unit_count" />
                  <SortHeader label="Meters" sortBy="meter_count" />
                  <SortHeader label="Residents" sortBy="resident_count" />
                  <SortHeader label="Added" sortBy="created_at" />
                  <SortHeader label="Status" sortBy="status" />
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Rows per page
              <select
                aria-label="Rows per page"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-lg border border-border bg-card px-2 py-1 text-sm"
              >
                {LIMIT_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <Pagination
              page={page}
              pageCount={pageCount}
              onPage={setPage}
              total={sortedRows.length}
            />
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
