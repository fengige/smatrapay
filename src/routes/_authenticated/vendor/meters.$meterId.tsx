import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import {
  INSTALLATION_STATUSES,
  listVendorMeterActivity,
  updateVendorInstallation,
} from "@/lib/vendor.functions";
import {
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  StatusBadge,
  formatDate,
  installationLabel,
  titleCase,
  useVendorScope,
} from "@/components/vendor/VendorUI";

export const Route = createFileRoute("/_authenticated/vendor/meters/$meterId")({
  head: () => ({
    meta: [
      { title: "Meter Details · Vendor · SmatraPay" },
      {
        name: "description",
        content: "Full meter record: specifications, assignment, zone and activity history.",
      },
      { property: "og:title", content: "Meter Details · Vendor · SmatraPay" },
      {
        property: "og:description",
        content: "Review and update one meter on your vendor account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorMeterDetail,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{error.message}</p>,
});

const TABS = ["Meter info", "Resident", "Zone", "Activity"] as const;

function VendorMeterDetail() {
  const access = Route.useLoaderData();
  const { meterId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useVendorScope();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Meter info");

  const fetchActivity = useServerFn(listVendorMeterActivity);
  const { data: activity } = useQuery({
    queryKey: ["vendor-meter-activity", meterId],
    queryFn: () => fetchActivity({ data: { meter_id: meterId, limit: 50 } }),
  });

  const saveInstall = useServerFn(updateVendorInstallation);
  const meter = data?.meters.find((m) => m.id === meterId);
  const resident = data?.residents.find((r) => r.unit_id && r.unit_id === meter?.unit_id);
  const zone = data?.zones.find((z) => z.zone_id === meter?.zone_id);

  const [install, setInstall] = useState<Record<string, string>>({});
  const value = (key: string, fallback: string | null | undefined) =>
    install[key] ?? fallback ?? "";

  const installMutation = useMutation({
    mutationFn: () =>
      saveInstall({
        data: {
          meter_id: meterId,
          installation_status: value(
            "installation_status",
            meter?.installation_status,
          ) as (typeof INSTALLATION_STATUSES)[number],
          installation_date: value("installation_date", meter?.installation_date) || null,
          installer: value("installer", meter?.installer) || null,
          installation_location: value("installation_location", meter?.installation_location) || null,
          installation_notes: value("installation_notes", meter?.installation_notes) || null,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["vendor-scope"] });
      setInstall({});
      toast.success("Installation updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DashboardShell
      access={access}
      title={meter ? `Meter ${meter.meter_number}` : "Meter"}
      description="Meter details"
    >
      {error ? (
        <ErrorBlock message={(error as Error).message} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : !meter ? (
        <EmptyState title="Meter not found" message="This meter is not registered to your account." />
      ) : (
        <div className="space-y-4 pb-6">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Link to="/vendor/meters" className="btn-outline inline-flex items-center gap-1 px-3 py-1">
              <ArrowLeft className="size-3" /> Back to meters
            </Link>
            <span>Vendor Portal → Meter Management → {meter.meter_number}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                  tab === t ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === "Meter info" && (
            <div className="space-y-4">
              <dl className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Meter number", meter.meter_number],
                  ["Serial number", meter.serial_number],
                  ["Type", titleCase(meter.type)],
                  ["Supplier", meter.supplier_name ?? "—"],
                  ["Price per unit", String(meter.price_per_unit)],
                  ["Initial reading", String(meter.initial_reading)],
                  ["SGC", meter.sgc ?? "—"],
                  ["KRN", meter.krn ?? "—"],
                  ["TI", meter.ti ?? "—"],
                  ["EA", meter.ea ?? "—"],
                  ["KEN", meter.ken ?? "—"],
                  ["Status", titleCase(meter.status)],
                  ["Installation", installationLabel(meter.installation_status)],
                  ["Unit", meter.unit_label ?? "—"],
                  ["Property", meter.property_name ?? "—"],
                  ["Date added", formatDate(meter.created_at)],
                  ["Last updated", formatDate(meter.updated_at)],
                ].map(([label, v]) => (
                  <div key={String(label)}>
                    <dt className="text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="mt-1 text-sm text-foreground">{String(v)}</dd>
                  </div>
                ))}
              </dl>

              <div className="rounded-2xl border border-border bg-card p-5">
                <h2 className="text-sm font-bold text-foreground">Installation</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="text-sm">
                    <span className="mb-1 block text-[0.65rem] font-bold uppercase text-muted-foreground">
                      Status
                    </span>
                    <select
                      className="input"
                      value={value("installation_status", meter.installation_status)}
                      onChange={(e) =>
                        setInstall((s) => ({ ...s, installation_status: e.target.value }))
                      }
                    >
                      {INSTALLATION_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {installationLabel(s)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-[0.65rem] font-bold uppercase text-muted-foreground">
                      Installation date
                    </span>
                    <input
                      type="date"
                      className="input"
                      value={(value("installation_date", meter.installation_date) || "").slice(0, 10)}
                      onChange={(e) => setInstall((s) => ({ ...s, installation_date: e.target.value }))}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-[0.65rem] font-bold uppercase text-muted-foreground">
                      Installer
                    </span>
                    <input
                      className="input"
                      value={value("installer", meter.installer)}
                      onChange={(e) => setInstall((s) => ({ ...s, installer: e.target.value }))}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-[0.65rem] font-bold uppercase text-muted-foreground">
                      Location
                    </span>
                    <input
                      className="input"
                      value={value("installation_location", meter.installation_location)}
                      onChange={(e) =>
                        setInstall((s) => ({ ...s, installation_location: e.target.value }))
                      }
                    />
                  </label>
                  <label className="text-sm lg:col-span-2">
                    <span className="mb-1 block text-[0.65rem] font-bold uppercase text-muted-foreground">
                      Notes
                    </span>
                    <input
                      className="input"
                      value={value("installation_notes", meter.installation_notes)}
                      onChange={(e) => setInstall((s) => ({ ...s, installation_notes: e.target.value }))}
                    />
                  </label>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    className="btn-primary px-4 py-2 text-sm"
                    disabled={installMutation.isPending}
                    onClick={() => installMutation.mutate()}
                  >
                    {installMutation.isPending ? "Saving…" : "Save installation"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === "Resident" &&
            (resident ? (
              <dl className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ["Name", resident.name ?? "—"],
                  ["Phone", resident.phone ?? "—"],
                  ["Email", resident.email ?? "—"],
                  ["Unit", resident.unit_label ?? "—"],
                  ["Property", resident.property_name ?? "—"],
                  ["Assigned", formatDate(resident.assigned_at)],
                ].map(([label, v]) => (
                  <div key={String(label)}>
                    <dt className="text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="mt-1 text-sm text-foreground">{String(v)}</dd>
                  </div>
                ))}
                <div className="sm:col-span-2 lg:col-span-3">
                  <Link
                    to="/vendor/residents/$residentId"
                    params={{ residentId: resident.id }}
                    className="text-sm font-semibold text-primary"
                  >
                    View resident
                  </Link>
                </div>
              </dl>
            ) : (
              <EmptyState
                title="No resident"
                message="This meter is not assigned to a resident yet."
              />
            ))}

          {tab === "Zone" &&
            (zone ? (
              <dl className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ["Zone", zone.zone_name],
                  ["Region", zone.region ?? "—"],
                  ["City", zone.city ?? "—"],
                  ["Status", zone.status],
                  ["Meters", String(zone.meter_count)],
                  ["Residents", String(zone.resident_count)],
                ].map(([label, v]) => (
                  <div key={String(label)}>
                    <dt className="text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="mt-1 text-sm text-foreground">{String(v)}</dd>
                  </div>
                ))}
                <div className="sm:col-span-2 lg:col-span-3">
                  <Link
                    to="/vendor/zones/$zoneId"
                    params={{ zoneId: String(zone.zone_id) }}
                    className="text-sm font-semibold text-primary"
                  >
                    View zone
                  </Link>
                </div>
              </dl>
            ) : (
              <EmptyState title="No zone" message="This meter is not linked to a zone yet." />
            ))}

          {tab === "Activity" && (
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              {(activity?.entries ?? []).length === 0 ? (
                <EmptyState title="No activity" message="No changes have been recorded for this meter." />
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2">Action</th>
                      <th className="px-4 py-2">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(activity?.entries ?? []).map((e) => (
                      <tr key={e.id} className="border-t border-border align-top">
                        <td className="px-4 py-2 whitespace-nowrap">{formatDate(e.created_at)}</td>
                        <td className="px-4 py-2">
                          <StatusBadge value={e.action} />
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">
                          {Object.entries(e.changes ?? {})
                            .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
                            .join(", ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
