import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
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

export const Route = createFileRoute("/_authenticated/vendor/zones/$zoneId")({
  head: () => ({
    meta: [
      { title: "Zone Details · Vendor · SmatraPay" },
      {
        name: "description",
        content: "Zone information, residents and meters for a zone served by your vendor account.",
      },
      { property: "og:title", content: "Zone Details · Vendor · SmatraPay" },
      {
        property: "og:description",
        content: "See residents and meters within one of your assigned zones.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorZoneDetail,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{error.message}</p>,
});

const TABS = ["Zone information", "Residents", "Meters"] as const;

function VendorZoneDetail() {
  const access = Route.useLoaderData();
  const { zoneId } = Route.useParams();
  const { data, isLoading, error } = useVendorScope();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Zone information");

  const zone = data?.zones.find((z) => String(z.zone_id) === zoneId);
  const meters = (data?.meters ?? []).filter((m) => String(m.zone_id) === zoneId);
  const residents = (data?.residents ?? []).filter((r) => String(r.zone_id) === zoneId);

  return (
    <DashboardShell access={access} title={zone?.zone_name ?? "Zone"} description="Zone details">
      {error ? (
        <ErrorBlock message={(error as Error).message} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : !zone ? (
        <EmptyState
          title="Zone not found"
          message="This zone is not assigned to your vendor account."
        />
      ) : (
        <div className="space-y-4 pb-6">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Link to="/vendor/zones" className="btn-outline inline-flex items-center gap-1 px-3 py-1">
              <ArrowLeft className="size-3" /> Back to zones
            </Link>
            <span>Vendor Portal → Zone Management → {zone.zone_name}</span>
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

          {tab === "Zone information" && (
            <dl className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Zone name", zone.zone_name],
                ["Region", zone.region ?? "—"],
                ["City", zone.city ?? "—"],
                ["Description", zone.description ?? "—"],
                ["Status", zone.status],
                ["Residents", String(zone.resident_count)],
                ["Meters", String(zone.meter_count)],
                ["Date created", formatDate(zone.created_at)],
                ["Last updated", formatDate(zone.updated_at)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">
                    {label}
                  </dt>
                  <dd className="mt-1 text-sm text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          )}

          {tab === "Residents" && (
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              {residents.length === 0 ? (
                <EmptyState
                  title="No residents"
                  message="No residents are currently associated with this zone."
                />
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2">Resident</th>
                      <th className="px-4 py-2">Phone</th>
                      <th className="px-4 py-2">Email</th>
                      <th className="px-4 py-2">Meter</th>
                      <th className="px-4 py-2">Type</th>
                      <th className="px-4 py-2">Account</th>
                      <th className="px-4 py-2">Meter status</th>
                      <th className="px-4 py-2">Assigned</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {residents.map((r) => (
                      <tr key={`${r.id}-${r.unit_id}`} className="border-t border-border">
                        <td className="px-4 py-2 font-semibold">{r.name ?? r.email ?? "—"}</td>
                        <td className="px-4 py-2">{r.phone ?? "—"}</td>
                        <td className="px-4 py-2">{r.email ?? "—"}</td>
                        <td className="px-4 py-2">{r.meter_number ?? "—"}</td>
                        <td className="px-4 py-2">{titleCase(r.meter_type)}</td>
                        <td className="px-4 py-2">
                          <StatusBadge value={r.status} />
                        </td>
                        <td className="px-4 py-2">
                          <StatusBadge value={r.meter_status} />
                        </td>
                        <td className="px-4 py-2">{formatDate(r.assigned_at)}</td>
                        <td className="px-4 py-2 text-right">
                          <Link
                            to="/vendor/residents/$residentId"
                            params={{ residentId: r.id }}
                            className="text-xs font-semibold text-primary"
                          >
                            View resident
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === "Meters" && (
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              {meters.length === 0 ? (
                <EmptyState title="No meters" message="No meters are assigned within this zone." />
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2">Meter</th>
                      <th className="px-4 py-2">Serial</th>
                      <th className="px-4 py-2">Type</th>
                      <th className="px-4 py-2">Resident</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Installation</th>
                      <th className="px-4 py-2">Installed</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {meters.map((m) => (
                      <tr key={m.id} className="border-t border-border">
                        <td className="px-4 py-2 font-semibold">{m.meter_number}</td>
                        <td className="px-4 py-2">{m.serial_number}</td>
                        <td className="px-4 py-2">{titleCase(m.type)}</td>
                        <td className="px-4 py-2">{m.resident_name ?? "—"}</td>
                        <td className="px-4 py-2">
                          <StatusBadge value={m.status} />
                        </td>
                        <td className="px-4 py-2">{installationLabel(m.installation_status)}</td>
                        <td className="px-4 py-2">{formatDate(m.installation_date)}</td>
                        <td className="px-4 py-2 text-right">
                          <Link
                            to="/vendor/meters/$meterId"
                            params={{ meterId: m.id }}
                            className="text-xs font-semibold text-primary"
                          >
                            View meter
                          </Link>
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
