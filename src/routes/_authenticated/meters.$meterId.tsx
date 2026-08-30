import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  Droplets,
  Flame,
  Gauge,
  Link2,
  Loader2,
  Power,
  PowerOff,
  Zap,
} from "lucide-react";

import {
  assignMeter,
  getMeter,
  listMeterAuditLogs,
  listMeters,
  setMeterStatus,
} from "@/lib/meters.functions";
import { PortalLayout } from "@/components/PortalLayout";

export const Route = createFileRoute("/_authenticated/meters/$meterId")({
  head: () => ({
    meta: [
      { title: "Meter Details · SmatraPay" },
      {
        name: "description",
        content:
          "View a meter's registry record: supplier, owner, unit assignment, tariff, STS keys and change history.",
      },
      { property: "og:title", content: "Meter Details · SmatraPay" },
      {
        property: "og:description",
        content: "Full meter record with assignment, tariff and STS key details.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MeterDetailPage,
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-destructive">{error.message}</div>
  ),
});

const TYPE_META = {
  electricity: { label: "Electricity", icon: Zap, tone: "bg-amber-500/12 text-amber-600" },
  water: { label: "Water", icon: Droplets, tone: "bg-sky-500/12 text-sky-600" },
  gas: { label: "Gas", icon: Flame, tone: "bg-orange-500/12 text-orange-600" },
} as const;

function typeMeta(type: string) {
  return (
    TYPE_META[type as keyof typeof TYPE_META] ?? {
      label: type ? type.charAt(0).toUpperCase() + type.slice(1) : "Other",
      icon: Gauge,
      tone: "bg-muted text-muted-foreground",
    }
  );
}

const money = (n: number) =>
  new Intl.NumberFormat("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-foreground">{value ?? "—"}</dd>
    </div>
  );
}

function MeterDetailPage() {
  const { meterId } = Route.useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const fetchMeter = useServerFn(getMeter);
  const fetchOptions = useServerFn(listMeters);
  const toggleStatus = useServerFn(setMeterStatus);

  const [showAssign, setShowAssign] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["meter", meterId],
    queryFn: () => fetchMeter({ data: { id: meterId } }),
  });
  const meter = data?.meter;

  const { data: options } = useQuery({
    queryKey: ["meters"],
    queryFn: () => fetchOptions(),
  });

  const statusMutation = useMutation({
    mutationFn: async (status: "active" | "inactive") =>
      toggleStatus({ data: { id: meterId, status } } as never),
    onSuccess: async (_r, status) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["meter", meterId] }),
        queryClient.invalidateQueries({ queryKey: ["meters"] }),
        queryClient.invalidateQueries({ queryKey: ["meter-audit", meterId] }),
      ]);
      toast.success(status === "active" ? "Meter activated" : "Meter deactivated");
    },
    onError: (err: Error) => toast.error(err.message || "Could not update meter status"),
  });

  const meta = typeMeta(meter?.type ?? "");
  const Icon = meta.icon;

  return (
    <PortalLayout
      roles={["admin"]}
      title={meter ? `Meter ${meter.meter_number}` : "Meter Details"}
      description="Registry record, assignment and change history."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/meters"
            search={{} as never}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent/10"
          >
            <ArrowLeft className="size-4" /> Back to meters
          </Link>
          {meter && (
            <>
              <button
                type="button"
                onClick={() => setShowAssign(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent/10"
              >
                <Link2 className="size-4" /> Assign meter
              </button>
              <button
                type="button"
                disabled={statusMutation.isPending}
                onClick={() =>
                  statusMutation.mutate(meter.status === "active" ? "inactive" : "active")
                }
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {statusMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : meter.status === "active" ? (
                  <PowerOff className="size-4" />
                ) : (
                  <Power className="size-4" />
                )}
                {meter.status === "active" ? "Deactivate" : "Activate"}
              </button>
            </>
          )}
        </div>
      }
    >
      {isLoading ? (
        <div className="flex items-center gap-2 p-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading meter…
        </div>
      ) : error || !meter ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          {(error as Error | undefined)?.message ?? "Meter not found."}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => navigate({ to: "/meters", search: {} as never })}
          >
            Return to Meter Management
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex size-11 items-center justify-center rounded-xl ${meta.tone}`}
              >
                <Icon className="size-5" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold">{meter.meter_number}</h2>
                <p className="text-sm text-muted-foreground">Serial {meter.serial_number}</p>
              </div>
              <span
                className={`ml-auto inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                  meter.status === "active"
                    ? "bg-emerald-500/12 text-emerald-600"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {meter.status}
              </span>
            </div>

            <dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Utility type" value={meta.label} />
              <Field label="Vendor ID" value={meter.vendor_id || "—"} />
              <Field label="Initial reading" value={money(meter.initial_reading)} />
              <Field label="Price per unit" value={money(meter.price_per_unit)} />
            </dl>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-xs font-bold tracking-wide uppercase text-muted-foreground">
                Assignment
              </h3>
              <dl className="mt-4 grid gap-5 sm:grid-cols-2">
                <Field
                  label="Unit"
                  value={
                    meter.unit ? (
                      <Link
                        to="/units/$unitId"
                        params={{ unitId: meter.unit.id }}
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        {meter.unit_label}
                      </Link>
                    ) : (
                      "Unassigned"
                    )
                  }
                />
                <Field
                  label="Property"
                  value={
                    meter.unit?.property_id ? (
                      <Link
                        to="/properties/$id"
                        params={{ id: meter.unit.property_id }}
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        {meter.unit.property_name ?? "View property"}
                      </Link>
                    ) : (
                      "—"
                    )
                  }
                />
                <Field
                  label="Landlord"
                  value={
                    meter.landlord ? (
                      <Link
                        to="/landlords/$id"
                        params={{ id: meter.landlord.id }}
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        {meter.landlord.name ?? meter.landlord.email ?? "View landlord"}
                      </Link>
                    ) : (
                      "Unassigned"
                    )
                  }
                />
                <Field
                  label="Agent"
                  value={meter.agent?.name ?? meter.agent?.email ?? "Unassigned"}
                />
              </dl>
            </section>

            <section className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-xs font-bold tracking-wide uppercase text-muted-foreground">
                Supplier
              </h3>
              {meter.supplier ? (
                <dl className="mt-4 grid gap-5 sm:grid-cols-2">
                  <Field label="Company" value={meter.supplier.company_name} />
                  <Field label="Utility" value={meter.supplier.utility_type} />
                  <Field label="Contact" value={meter.supplier.contact_name ?? "—"} />
                  <Field label="Email" value={meter.supplier.email ?? "—"} />
                  <Field label="Phone" value={meter.supplier.phone_number ?? "—"} />
                  <Field label="Supplier status" value={meter.supplier.status} />
                </dl>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No supplier linked.</p>
              )}
            </section>
          </div>

          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-xs font-bold tracking-wide uppercase text-muted-foreground">
              STS key settings
            </h3>
            <dl className="mt-4 grid gap-5 sm:grid-cols-3 lg:grid-cols-5">
              <Field label="SGC" value={meter.sgc ?? "—"} />
              <Field label="KRN" value={meter.krn ?? "—"} />
              <Field label="TI" value={meter.ti ?? "—"} />
              <Field label="EA" value={meter.ea ?? "—"} />
              <Field label="KEN" value={meter.ken ?? "—"} />
            </dl>
            <dl className="mt-5 grid gap-5 sm:grid-cols-2">
              <Field label="Created" value={new Date(meter.created_at).toLocaleString()} />
              <Field label="Last updated" value={new Date(meter.updated_at).toLocaleString()} />
            </dl>
          </section>

          <MeterHistoryPanel meterId={meterId} />

          {showAssign && (
            <AssignMeterDialog
              meterId={meterId}
              current={{
                unit_id: meter.unit_id,
                landlord_id: meter.landlord_id,
                agent_id: meter.agent_id,
              }}
              units={options?.units ?? []}
              landlords={options?.landlords ?? []}
              agents={options?.agents ?? []}
              onClose={() => setShowAssign(false)}
            />
          )}
        </div>
      )}
    </PortalLayout>
  );
}

const HISTORY_LABELS: Record<string, string> = {
  initial_reading: "Reading",
  price_per_unit: "Price per unit",
  type: "Type",
  status: "Status",
};

function MeterHistoryPanel({ meterId }: { meterId: string }) {
  const fetchLogs = useServerFn(listMeterAuditLogs);
  const { data, isLoading } = useQuery({
    queryKey: ["meter-audit", meterId],
    queryFn: () => fetchLogs({ data: { meter_id: meterId } }),
  });
  const logs = data?.logs ?? [];

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-xs font-bold tracking-wide uppercase text-muted-foreground">
        Change history
      </h3>
      {isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading history…</p>
      ) : logs.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No changes recorded yet.</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {logs.map((log) => (
            <li key={log.id} className="border-l-2 border-primary/40 pl-3">
              <p className="text-xs text-muted-foreground">
                {new Date(log.created_at).toLocaleString()} ·{" "}
                <span className="font-medium text-foreground">{log.actor_name ?? "System"}</span>
              </p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {Object.entries(log.changes).map(([field, diff]) => (
                  <li key={field}>
                    <span className="font-medium">{HISTORY_LABELS[field] ?? field}:</span>{" "}
                    <span className="text-muted-foreground line-through">{diff.old ?? "—"}</span> →{" "}
                    <span className="font-semibold">{diff.new ?? "—"}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function AssignMeterDialog({
  meterId,
  current,
  units,
  landlords,
  agents,
  onClose,
}: {
  meterId: string;
  current: { unit_id: string | null; landlord_id: string | null; agent_id: string | null };
  units: { id: string; label: string; property_name: string | null }[];
  landlords: { id: string; name: string }[];
  agents: { id: string; name: string }[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(assignMeter);

  const [unitId, setUnitId] = useState(current.unit_id ?? "");
  const [landlordId, setLandlordId] = useState(current.landlord_id ?? "");
  const [agentId, setAgentId] = useState(current.agent_id ?? "");
  const [unitSearch, setUnitSearch] = useState("");

  const visibleUnits = useMemo(() => {
    const q = unitSearch.trim().toLowerCase();
    if (!q) return units.slice(0, 200);
    return units.filter((u) => u.label.toLowerCase().includes(q)).slice(0, 200);
  }, [units, unitSearch]);

  const mutation = useMutation({
    mutationFn: async () =>
      save({
        data: {
          id: meterId,
          unit_id: unitId || null,
          landlord_id: landlordId || null,
          agent_id: agentId || null,
        },
      } as never),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["meter", meterId] }),
        queryClient.invalidateQueries({ queryKey: ["meters"] }),
      ]);
      toast.success("Meter assignment updated");
      onClose();
    },
    onError: (err: Error) => toast.error(err.message || "Could not assign meter"),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Assign meter"
    >
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl">
        <h2 className="text-lg font-semibold">Assign meter</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Link this meter to a unit and set the responsible landlord or agent.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="assign-unit-search" className="text-sm font-medium">
              Unit
            </label>
            <input
              id="assign-unit-search"
              value={unitSearch}
              onChange={(e) => setUnitSearch(e.target.value)}
              placeholder="Search units…"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <select
              aria-label="Unit"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">Unassigned</option>
              {visibleUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="assign-landlord" className="text-sm font-medium">
              Landlord
            </label>
            <select
              id="assign-landlord"
              value={landlordId}
              onChange={(e) => setLandlordId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">Unassigned</option>
              {landlords.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="assign-agent" className="text-sm font-medium">
              Agent
            </label>
            <select
              id="assign-agent"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">Unassigned</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent/10"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Save assignment
          </button>
        </div>
      </div>
    </div>
  );
}
