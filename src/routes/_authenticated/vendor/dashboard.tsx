import { createFileRoute, Link } from "@tanstack/react-router";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import {
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  StatCard,
  StatusBadge,
  formatDate,
  installationLabel,
  titleCase,
  useVendorScope,
} from "@/components/vendor/VendorUI";

export const Route = createFileRoute("/_authenticated/vendor/dashboard")({
  head: () => ({
    meta: [
      { title: "Vendor Dashboard · SmatraPay" },
      {
        name: "description",
        content:
          "Live overview of the meters, zones and residents assigned to your SmatraPay vendor account.",
      },
      { property: "og:title", content: "Vendor Dashboard · SmatraPay" },
      {
        property: "og:description",
        content: "Track assigned zones, meter installations and resident activity in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorDashboard,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{error.message}</p>,
});

function VendorDashboard() {
  const access = Route.useLoaderData();
  const { data, isLoading, error } = useVendorScope();

  const meters = data?.meters ?? [];
  const zones = data?.zones ?? [];
  const residents = data?.residents ?? [];

  const stats = [
    { label: "Assigned zones", value: zones.length },
    { label: "Assigned meters", value: meters.length },
    { label: "Active meters", value: meters.filter((m) => m.status === "active").length },
    { label: "Inactive meters", value: meters.filter((m) => m.status !== "active").length },
    { label: "Residents", value: new Set(residents.map((r) => r.id)).size },
    { label: "Active residents", value: residents.filter((r) => r.status === "active").length },
    { label: "Meters installed", value: meters.filter((m) => m.installation_status === "installed").length },
    {
      label: "Not installed",
      value: meters.filter((m) => m.installation_status !== "installed").length,
    },
  ];

  const recentMeters = [...meters].slice(0, 8);
  const recentResidents = [...residents]
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    .slice(0, 6);

  return (
    <DashboardShell
      access={access}
      title="Vendor dashboard"
      description="Everything assigned to your vendor account."
    >
      {error ? (
        <ErrorBlock message={(error as Error).message} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-5 pb-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((s) => (
              <StatCard key={s.label} label={s.label} value={s.value} />
            ))}
          </div>

          <section>
            <h2 className="mb-2 text-sm font-bold text-foreground">Prepaid meter operations</h2>
            {opsSummary.isLoading ? (
              <LoadingBlock label="Loading prepaid figures…" />
            ) : opsSummary.error ? (
              <ErrorBlock message={(opsSummary.error as Error).message} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Active prepaid meters" value={opsSummary.data?.active_meters ?? 0} />
                <StatCard label="Pending activation" value={opsSummary.data?.pending_activation ?? 0} />
                <StatCard label="Recent token requests" value={opsSummary.data?.recent_token_requests ?? 0} />
                <StatCard label="Total token transactions" value={opsSummary.data?.tokens_total ?? 0} />
                <StatCard
                  label="Payments today"
                  value={(opsSummary.data?.payments_today ?? 0).toLocaleString()}
                />
                <StatCard label="Open service requests" value={opsSummary.data?.open_service_requests ?? 0} />
                <StatCard label="Pending installations" value={opsSummary.data?.pending_installations ?? 0} />
                <StatCard
                  label="Completed installations"
                  value={opsSummary.data?.completed_installations ?? 0}
                />
              </div>
            )}
          </section>


          <section className="rounded-2xl border border-border bg-card">
            <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h2 className="text-sm font-bold text-foreground">Assigned zones</h2>
              <Link to="/vendor/zones" className="text-xs font-semibold text-primary">
                View all
              </Link>
            </header>
            {zones.length === 0 ? (
              <EmptyState
                title="No zones"
                message="No zones have been assigned to your vendor account yet."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2">Zone</th>
                      <th className="px-4 py-2">Region</th>
                      <th className="px-4 py-2">City</th>
                      <th className="px-4 py-2">Residents</th>
                      <th className="px-4 py-2">Meters</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {zones.slice(0, 6).map((z) => (
                      <tr key={z.zone_id} className="border-t border-border">
                        <td className="px-4 py-2 font-semibold">{z.zone_name}</td>
                        <td className="px-4 py-2">{z.region ?? "—"}</td>
                        <td className="px-4 py-2">{z.city ?? "—"}</td>
                        <td className="px-4 py-2">{z.resident_count}</td>
                        <td className="px-4 py-2">{z.meter_count}</td>
                        <td className="px-4 py-2">
                          <StatusBadge value={z.status} />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Link
                            to="/vendor/zones/$zoneId"
                            params={{ zoneId: String(z.zone_id) }}
                            className="text-xs font-semibold text-primary"
                          >
                            View zone
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="rounded-2xl border border-border bg-card">
              <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <h2 className="text-sm font-bold text-foreground">Recent meter activity</h2>
                <Link to="/vendor/meters" className="text-xs font-semibold text-primary">
                  All meters
                </Link>
              </header>
              {recentMeters.length === 0 ? (
                <EmptyState
                  title="No meters"
                  message="No meters are currently assigned to your vendor account."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2">Meter</th>
                        <th className="px-4 py-2">Resident</th>
                        <th className="px-4 py-2">Zone</th>
                        <th className="px-4 py-2">Installation</th>
                        <th className="px-4 py-2">Updated</th>
                        <th className="px-4 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentMeters.map((m) => (
                        <tr key={m.id} className="border-t border-border">
                          <td className="px-4 py-2 font-semibold">
                            <Link to="/vendor/meters/$meterId" params={{ meterId: m.id }}>
                              {m.meter_number}
                            </Link>
                          </td>
                          <td className="px-4 py-2">{m.resident_name ?? "—"}</td>
                          <td className="px-4 py-2">{m.zone_name ?? "—"}</td>
                          <td className="px-4 py-2">{installationLabel(m.installation_status)}</td>
                          <td className="px-4 py-2">{formatDate(m.updated_at)}</td>
                          <td className="px-4 py-2">
                            <StatusBadge value={m.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-card">
              <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <h2 className="text-sm font-bold text-foreground">Recent residents</h2>
                <Link to="/vendor/residents" className="text-xs font-semibold text-primary">
                  All residents
                </Link>
              </header>
              {recentResidents.length === 0 ? (
                <EmptyState
                  title="No residents"
                  message="No residents are currently associated with your assigned zones."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2">Resident</th>
                        <th className="px-4 py-2">Phone</th>
                        <th className="px-4 py-2">Zone</th>
                        <th className="px-4 py-2">Meter</th>
                        <th className="px-4 py-2">Account</th>
                        <th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {recentResidents.map((r) => (
                        <tr key={`${r.id}-${r.unit_id}`} className="border-t border-border">
                          <td className="px-4 py-2 font-semibold">{r.name ?? r.email ?? "—"}</td>
                          <td className="px-4 py-2">{r.phone ?? "—"}</td>
                          <td className="px-4 py-2">{r.zone_name ?? "—"}</td>
                          <td className="px-4 py-2">{r.meter_number ?? "—"}</td>
                          <td className="px-4 py-2">{titleCase(r.status)}</td>
                          <td className="px-4 py-2 text-right">
                            <Link
                              to="/vendor/residents/$residentId"
                              params={{ residentId: r.id }}
                              className="text-xs font-semibold text-primary"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
