import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  Building2,
  Download,
  Home,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  Users as UsersIcon,
  type LucideIcon,
} from "lucide-react";

import { listUsersByRole } from "@/lib/users.functions";
import { PortalLayout } from "@/components/PortalLayout";

export const Route = createFileRoute("/_authenticated/properties/")({
  head: () => ({
    meta: [
      { title: "Property Management · SmatraPay" },
      {
        name: "description",
        content:
          "Manage SmatraPay properties: buildings, units, assigned residents and landlords across the portfolio.",
      },
      { property: "og:title", content: "Property Management · SmatraPay" },
      {
        property: "og:description",
        content: "View every property, its buildings, units, residents and landlords on SmatraPay.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PropertiesPage,
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-destructive">{error.message}</div>
  ),
});

type Person = {
  id: string;
  name: string | null;
  email: string | null;
  property: string | null;
  building: string | null;
  unit_number: string | null;
  status: string;
};

type PropertyRow = {
  property: string;
  buildings: string[];
  units: string[];
  residents: number;
  activeResidents: number;
  landlords: string[];
};

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <Icon className={`size-4 ${tone ?? "text-muted-foreground"}`} />
      </div>
      <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

function PropertiesPage() {
  const fetchByRole = useServerFn(listUsersByRole);
  const [search, setSearch] = useState("");

  const residentsQuery = useQuery({
    queryKey: ["users", "resident"],
    queryFn: () => fetchByRole({ data: { role: "resident" } }),
  });
  const landlordsQuery = useQuery({
    queryKey: ["users", "landlord"],
    queryFn: () => fetchByRole({ data: { role: "landlord" } }),
  });

  const isLoading = residentsQuery.isLoading || landlordsQuery.isLoading;
  const isFetching = residentsQuery.isFetching || landlordsQuery.isFetching;
  const error = (residentsQuery.error ?? landlordsQuery.error) as Error | null;

  const rows = useMemo<PropertyRow[]>(() => {
    const residents = (residentsQuery.data?.users ?? []) as unknown as Person[];
    const landlords = (landlordsQuery.data?.users ?? []) as unknown as Person[];
    const map = new Map<string, PropertyRow>();

    const ensure = (name: string) => {
      let row = map.get(name);
      if (!row) {
        row = {
          property: name,
          buildings: [],
          units: [],
          residents: 0,
          activeResidents: 0,
          landlords: [],
        };
        map.set(name, row);
      }
      return row;
    };

    for (const person of residents) {
      const name = (person.property ?? "").trim();
      if (!name) continue;
      const row = ensure(name);
      row.residents += 1;
      if (person.status === "active") row.activeResidents += 1;
      const building = (person.building ?? "").trim();
      if (building && !row.buildings.includes(building)) row.buildings.push(building);
      const unit = (person.unit_number ?? "").trim();
      if (unit && !row.units.includes(unit)) row.units.push(unit);
    }

    for (const person of landlords) {
      const name = (person.property ?? "").trim();
      if (!name) continue;
      const row = ensure(name);
      const label = person.name || person.email || "Landlord";
      if (!row.landlords.includes(label)) row.landlords.push(label);
      const building = (person.building ?? "").trim();
      if (building && !row.buildings.includes(building)) row.buildings.push(building);
    }

    return [...map.values()].sort((a, b) => a.property.localeCompare(b.property));
  }, [residentsQuery.data, landlordsQuery.data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [row.property, ...row.buildings, ...row.units, ...row.landlords]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [rows, search]);

  const stats = useMemo(
    () => ({
      properties: rows.length,
      buildings: rows.reduce((sum, r) => sum + r.buildings.length, 0),
      units: rows.reduce((sum, r) => sum + r.units.length, 0),
      residents: rows.reduce((sum, r) => sum + r.residents, 0),
    }),
    [rows],
  );

  const refresh = () => {
    void residentsQuery.refetch();
    void landlordsQuery.refetch();
  };

  const exportCsv = () => {
    const header = ["Property", "Buildings", "Units", "Residents", "Active Residents", "Landlords"];
    const lines = filtered.map((r) => [
      r.property,
      r.buildings.join(" | "),
      String(r.units.length),
      String(r.residents),
      String(r.activeResidents),
      r.landlords.join(" | "),
    ]);
    const csv = [header, ...lines]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `smatrapay-properties-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PortalLayout
      roles={["admin"]}
      title="Property Management"
      description="Properties, buildings and units across the portfolio"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={!filtered.length}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10 disabled:opacity-60"
          >
            <Download className="size-4" /> Export CSV ({filtered.length})
          </button>
          <button
            type="button"
            onClick={refresh}
            aria-label="Refresh properties"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10"
          >
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Properties" value={stats.properties} icon={Home} />
          <StatCard label="Buildings" value={stats.buildings} icon={Building2} />
          <StatCard label="Units" value={stats.units} icon={Layers} tone="text-emerald-600" />
          <StatCard label="Residents Housed" value={stats.residents} icon={UsersIcon} />
        </div>

        <section className="rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
            <div className="flex min-w-[220px] flex-1 items-stretch overflow-hidden rounded-lg border border-border focus-within:border-primary">
              <span className="flex items-center bg-muted/50 px-3 text-muted-foreground">
                <Search className="size-4" />
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by property, building, unit or landlord"
                className="w-full bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/70"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Property</th>
                  <th className="px-4 py-3 font-semibold">Buildings</th>
                  <th className="px-4 py-3 font-semibold">Units</th>
                  <th className="px-4 py-3 font-semibold">Residents</th>
                  <th className="px-4 py-3 font-semibold">Active</th>
                  <th className="px-4 py-3 font-semibold">Landlords</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      <Loader2 className="mx-auto size-5 animate-spin" />
                    </td>
                  </tr>
                )}
                {!isLoading && error && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-destructive">
                      {error.message}
                    </td>
                  </tr>
                )}
                {!isLoading && !error && !filtered.length && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      No properties yet. Properties appear here once residents or landlords are
                      assigned to one.
                    </td>
                  </tr>
                )}
                {filtered.map((row) => (
                  <tr key={row.property} className="border-t border-border">
                    <td className="px-4 py-3 font-semibold text-foreground">{row.property}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.buildings.length ? row.buildings.join(", ") : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{row.units.length}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.residents}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-emerald-500/12 px-2.5 py-1 text-xs font-semibold text-emerald-600">
                        {row.activeResidents} active
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.landlords.length ? row.landlords.join(", ") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </PortalLayout>
  );
}
