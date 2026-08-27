import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Download,
  Droplets,
  Flame,
  Gauge,
  Home,
  Loader2,
  Plus,
  Search,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { addMeter, listMeters } from "@/lib/properties.functions";
import { PortalLayout } from "@/components/PortalLayout";


export const Route = createFileRoute("/_authenticated/meters/")({
  head: () => ({
    meta: [
      { title: "Meter Management · SmatraPay" },
      {
        name: "description",
        content:
          "Monitor every electricity, water and gas meter across SmatraPay properties, with unit, property and landlord context.",
      },
      { property: "og:title", content: "Meter Management · SmatraPay" },
      {
        property: "og:description",
        content: "Search and filter the hardware asset registry of meters by serial, type and property.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MetersPage,
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-destructive">{error.message}</div>
  ),
});

const TYPE_META = {
  electricity: { label: "Electricity", icon: Zap, tone: "bg-amber-500/10 text-amber-600" },
  water: { label: "Water", icon: Droplets, tone: "bg-sky-500/10 text-sky-600" },
  gas: { label: "Gas", icon: Flame, tone: "bg-orange-500/10 text-orange-600" },
} as const;

const statusTone: Record<string, string> = {
  vacant: "bg-muted text-muted-foreground",
  occupied: "bg-emerald-500/10 text-emerald-600",
  maintenance: "bg-amber-500/10 text-amber-600",
  archived: "bg-destructive/10 text-destructive",
};

function MetersPage() {
  const queryClient = useQueryClient();
  const fetchMeters = useServerFn(listMeters);
  const saveMeter = useServerFn(addMeter);
  const { data, isLoading } = useQuery({
    queryKey: ["meters"],
    queryFn: () => fetchMeters(),
  });

  const [query, setQuery] = useState("");
  const [type, setType] = useState<string>("all");
  const [propertyId, setPropertyId] = useState<string>("all");
  const [showAdd, setShowAdd] = useState(false);


  const meters = data?.meters ?? [];
  const properties = data?.properties ?? [];
  const units = data?.units ?? [];


  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return meters.filter((m) => {
      if (type !== "all" && m.type !== type) return false;
      if (propertyId !== "all" && m.property_id !== propertyId) return false;
      if (!q) return true;
      return [m.serial, m.unit_number, m.property_name, m.landlord_name ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [meters, query, type, propertyId]);

  const counts = useMemo(
    () => ({
      electricity: meters.filter((m) => m.type === "electricity").length,
      water: meters.filter((m) => m.type === "water").length,
      gas: meters.filter((m) => m.type === "gas").length,
    }),
    [meters],
  );

  const exportCsv = () => {
    const rows = [
      ["Meter serial", "Type", "Unit", "Property", "Landlord", "Unit status"],
      ...filtered.map((m) => [
        m.serial,
        TYPE_META[m.type].label,
        m.unit_number,
        m.property_name,
        m.landlord_name ?? "—",
        m.unit_status,
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "meters.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PortalLayout
      roles={["admin"]}
      title="Meter Management"
      description="Every electricity, water and gas meter across your properties."
      hideHeading
    >
      <div className="space-y-6 p-6">
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
            <span className="grid size-8 place-items-center rounded-xl bg-primary/10">
              <Gauge className="size-4" />
            </span>
            Hardware asset registry
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Meter Management</h1>
          <p className="text-sm text-muted-foreground">
            Monitor every electricity, water and gas meter registered against your units.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-3">
          {(Object.keys(TYPE_META) as (keyof typeof TYPE_META)[]).map((key) => {
            const meta = TYPE_META[key];
            const Icon = meta.icon;
            return (
              <div key={key} className="rounded-2xl border bg-card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {meta.label} meters
                  </span>
                  <span className={`grid size-8 place-items-center rounded-lg ${meta.tone}`}>
                    <Icon className="size-4" />
                  </span>
                </div>
                <p className="mt-2 text-2xl font-bold">{counts[key]}</p>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by meter serial number, unit or property…"
              aria-label="Search meters"
              className="h-11 w-full rounded-xl border bg-background pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="size-4" /> Add Meter
          </button>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            aria-label="Filter by meter type"
            className="h-11 rounded-xl border bg-background px-3 text-sm"
          >
            <option value="all">All types</option>
            <option value="electricity">Electricity</option>
            <option value="water">Water</option>
            <option value="gas">Gas</option>
          </select>
          <select
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            aria-label="Filter by property"
            className="h-11 rounded-xl border bg-background px-3 text-sm"
          >
            <option value="all">All properties</option>
            {properties.map((p: { id: string; name: string }) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-medium disabled:opacity-50"
          >
            <Download className="size-4" /> Export CSV
          </button>
        </div>


        {isLoading ? (
          <div className="flex items-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading meters…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            No meters match your filters. Add meter numbers on a unit to see them here.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((m) => {
              const meta = TYPE_META[m.type];
              const Icon = meta.icon;
              return (
                <article key={m.key} className="rounded-2xl border bg-card p-5 shadow-sm">
                  <div className="flex items-start justify-between">
                    <span className={`grid size-10 place-items-center rounded-xl ${meta.tone}`}>
                      <Icon className="size-5" />
                    </span>
                    <Link
                      to="/units/$unitId"
                      params={{ unitId: m.unit_id }}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      View unit
                    </Link>
                  </div>
                  <p className="mt-4 text-sm font-semibold">Meter Number: {m.serial}</p>
                  <h2 className="text-lg font-bold">Unit {m.unit_number}</h2>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold uppercase">
                    <span
                      className={`rounded-md px-2 py-1 ${statusTone[m.unit_status] ?? "bg-muted text-muted-foreground"}`}
                    >
                      {m.unit_status}
                    </span>
                    <span className={`rounded-md px-2 py-1 ${meta.tone}`}>{meta.label}</span>
                  </div>
                  <dl className="mt-4 space-y-2 border-t pt-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Building2 className="size-4 text-muted-foreground" />
                      <dt className="sr-only">Property</dt>
                      <dd>
                        <Link
                          to="/properties/$id"
                          params={{ id: m.property_id }}
                          className="hover:underline"
                        >
                          {m.property_name}
                        </Link>
                      </dd>
                    </div>
                    <div className="flex items-center gap-2">
                      <Home className="size-4 text-muted-foreground" />
                      <dt className="sr-only">Landlord</dt>
                      <dd className="text-muted-foreground">{m.landlord_name ?? "No landlord"}</dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>
        )}

        {showAdd && (
          <AddMeterDialog
            properties={properties}
            units={units}
            onClose={() => setShowAdd(false)}
            onSaved={async () => {
              setShowAdd(false);
              await queryClient.invalidateQueries({ queryKey: ["meters"] });
              toast.success("Meter added");
            }}
          />
        )}
      </div>
    </PortalLayout>
  );
}

function AddMeterDialog({

  properties,
  units,
  onClose,
  onSaved,
}: {
  properties: { id: string; name: string }[];
  units: { id: string; property_id: string; unit_number: string }[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const saveMeter = useServerFn(addMeter);

  const [propertyId, setPropertyId] = useState<string>("");
  const [unitId, setUnitId] = useState<string>("");
  const [meterType, setMeterType] = useState<"electricity" | "water" | "gas">("electricity");
  const [serial, setSerial] = useState<string>("");

  useEffect(() => {
    setUnitId("");
  }, [propertyId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const unitChoices = useMemo(
    () => units.filter((u) => u.property_id === propertyId).sort((a, b) => a.unit_number.localeCompare(b.unit_number)),
    [units, propertyId],
  );

  const mutation = useMutation({
    mutationFn: async () => {
      if (!unitId) throw new Error("Please select a unit");
      if (!serial.trim()) throw new Error("Please enter a meter serial number");
      await saveMeter({ data: { unit_id: unitId, type: meterType, serial: serial.trim() } } as never);
    },
    onSuccess: () => {
      setSerial("");
      onSaved();
    },
    onError: (err: Error) => toast.error(err.message || "Could not add meter"),
  });

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-meter-title"
    >
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-lg">
        <h2 id="add-meter-title" className="text-lg font-bold">
          Add Meter
        </h2>
        <p className="text-sm text-muted-foreground">Assign a meter serial number to a unit.</p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="meter-property">
              Property
            </label>
            <select
              id="meter-property"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
            >
              <option value="">Select property</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="meter-unit">
              Unit
            </label>
            <select
              id="meter-unit"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              disabled={!propertyId || unitChoices.length === 0}
              className="h-11 w-full rounded-xl border bg-background px-3 text-sm disabled:opacity-50"
            >
              <option value="">{unitChoices.length ? "Select unit" : "No units available"}</option>
              {unitChoices.map((u) => (
                <option key={u.id} value={u.id}>
                  Unit {u.unit_number}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="meter-type">
              Meter Type
            </label>
            <select
              id="meter-type"
              value={meterType}
              onChange={(e) => setMeterType(e.target.value as typeof meterType)}
              className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
            >
              <option value="electricity">Electricity</option>
              <option value="water">Water</option>
              <option value="gas">Gas</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="meter-serial">
              Serial Number
            </label>
            <input
              id="meter-serial"
              type="text"
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              placeholder="e.g. EM-2026-001"
              className="h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent/10"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={mutation.isPending || !unitId || !serial.trim()}
            onClick={() => mutation.mutate()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Save Meter
          </button>
        </div>
      </div>
    </div>
  );
}


