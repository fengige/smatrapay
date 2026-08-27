import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Home, Layers } from "lucide-react";
import { getUnit } from "@/lib/properties.functions";
import { PortalLayout } from "@/components/PortalLayout";

export const Route = createFileRoute("/_authenticated/units/$unitId")({
  head: () => ({
    meta: [
      { title: "Unit Details · SmatraPay" },
      {
        name: "description",
        content: "View unit details, meter numbers and occupant assignments.",
      },
      { property: "og:title", content: "Unit Details · SmatraPay" },
      {
        property: "og:description",
        content: "View unit details, meter numbers and occupant assignments.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UnitDetailPage,
});

type Unit = {
  id: string;
  unit_number: string;
  building: string | null;
  unit_type: string | null;
  bedrooms: number | null;
  floor: string | null;
  status: string;
  electricity_meter_no: string | null;
  water_meter_no: string | null;
  gas_meter_no: string | null;
};

type Assignment = {
  id: string;
  user_id: string;
  role: string;
  start_date: string;
  end_date: string | null;
};

type Person = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
};

function UnitDetailPage() {
  const { unitId } = Route.useParams();
  const fetchUnit = useServerFn(getUnit);
  const { data, isLoading, error } = useQuery({
    queryKey: ["units", unitId],
    queryFn: () => fetchUnit({ data: { unitId } }),
    retry: (count, err) =>
      !/not found/i.test((err as Error)?.message ?? "") && count < 2,
  });

  const unit = data?.unit as Unit | null | undefined;
  const property = data?.property as { id: string; name: string } | null | undefined;
  const assignments = (data?.assignments ?? []) as Assignment[];
  const people = (data?.people ?? []) as Person[];
  const personById = new Map(people.map((p) => [p.id, p]));

  return (
    <PortalLayout
      roles={["admin"]}
      title={unit ? `Unit ${unit.unit_number}` : "Unit"}
      description="Unit details, meter numbers and assignments"
      actions={
        <Link
          to="/properties/$id"
          params={{ id: property?.id ?? "" }}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10"
        >
          <ArrowLeft className="size-4" /> Back to property
        </Link>
      }
    >
      {isLoading ? (
        <div className="p-10 text-center text-muted-foreground">Loading unit…</div>
      ) : error ? (
        <div className="p-10 text-sm text-destructive">{(error as Error).message}</div>
      ) : !unit ? (
        <div className="p-10 text-center text-muted-foreground">Unit not found.</div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Home className="size-6" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-bold text-foreground">
                  Unit {unit.unit_number}
                  {unit.building && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      · {unit.building}
                    </span>
                  )}
                </h2>
                {property && (
                  <p className="text-xs text-muted-foreground">
                    Property:{" "}
                    <Link
                      to="/properties/$id"
                      params={{ id: property.id }}
                      className="text-primary hover:underline"
                    >
                      {property.name}
                    </Link>
                  </p>
                )}
              </div>
              <Pill value={unit.status} />
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Type" value={unit.unit_type || "—"} icon={Layers} />
              <StatCard label="Bedrooms" value={unit.bedrooms ?? "—"} icon={Layers} />
              <StatCard label="Floor" value={unit.floor || "—"} icon={Layers} />
              <StatCard label="Status" value={unit.status} icon={Layers} />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <StatCard
                label="Electricity meter"
                value={unit.electricity_meter_no || "—"}
                icon={Layers}
              />
              <StatCard label="Water meter" value={unit.water_meter_no || "—"} icon={Layers} />
              <StatCard label="Gas meter" value={unit.gas_meter_no || "—"} icon={Layers} />
            </div>
          </div>

          <section className="rounded-2xl border border-border bg-card">
            <div className="border-b border-border p-4">
              <h3 className="text-sm font-bold text-foreground">Assignments</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">Email</th>
                    <th className="px-4 py-3 font-semibold">Phone</th>
                    <th className="px-4 py-3 font-semibold">Start</th>
                    <th className="px-4 py-3 font-semibold">End</th>
                  </tr>
                </thead>
                <tbody>
                  {!assignments.length && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                        No assignments for this unit.
                      </td>
                    </tr>
                  )}
                  {assignments.map((a) => {
                    const person = personById.get(a.user_id);
                    return (
                      <tr key={a.id} className="border-t border-border">
                        <td className="px-4 py-3 capitalize text-foreground">{a.role}</td>
                        <td className="px-4 py-3 font-semibold text-foreground">
                          {person?.name || "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {person?.email || "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {person?.phone || "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{fmt(a.start_date)}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {a.end_date ? fmt(a.end_date) : "Current"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </PortalLayout>
  );
}

function fmt(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

function Pill({ value }: { value: string }) {
  const tone: Record<string, string> = {
    active: "bg-emerald-500/12 text-emerald-600",
    occupied: "bg-emerald-500/12 text-emerald-600",
    vacant: "bg-sky-500/12 text-sky-600",
    maintenance: "bg-amber-500/15 text-amber-600",
    pending: "bg-amber-500/15 text-amber-600",
    archived: "bg-muted text-muted-foreground",
    inactive: "bg-muted text-muted-foreground",
    suspended: "bg-destructive/12 text-destructive",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
        tone[value] ?? "bg-muted text-muted-foreground"
      }`}
    >
      {value}
    </span>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: any;
  icon: any;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <p className="mt-1.5 text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}
