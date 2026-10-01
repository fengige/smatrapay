import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download } from "lucide-react";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import {
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  downloadCsv,
  formatDate,
  installationLabel,
  titleCase,
  useVendorScope,
} from "@/components/vendor/VendorUI";
import { INSTALLATION_STATUSES } from "@/lib/vendor.functions";
import {
  listServiceRequests,
  listVendorReadings,
  listVendorTokens,
} from "@/lib/vendor-ops.functions";

export const Route = createFileRoute("/_authenticated/vendor/reports")({
  head: () => ({
    meta: [
      { title: "Reports · Vendor · SmatraPay" },
      {
        name: "description",
        content: "Meter, resident, zone and installation reports for your assigned resources.",
      },
      { property: "og:title", content: "Reports · Vendor · SmatraPay" },
      {
        property: "og:description",
        content: "Filter and export reports covering everything assigned to you.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorReports,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{(error as Error).message}</p>,
});

const REPORTS = [
  "Meters",
  "Residents",
  "Zones",
  "Installations",
  "Transactions",
  "Readings",
  "Maintenance",
] as const;

function VendorReports() {
  const access = Route.useLoaderData();
  const { data, isLoading, error } = useVendorScope();
  const fetchTokens = useServerFn(listVendorTokens);
  const fetchReadings = useServerFn(listVendorReadings);
  const fetchRequests = useServerFn(listServiceRequests);
  const tokensQuery = useQuery({ queryKey: ["vendor-tokens", "", ""], queryFn: () => fetchTokens({ data: {} }) });
  const readingsQuery = useQuery({ queryKey: ["vendor-readings"], queryFn: () => fetchReadings({ data: {} }) });
  const requestsQuery = useQuery({ queryKey: ["vendor-service-requests"], queryFn: () => fetchRequests() });
  const [report, setReport] = useState<(typeof REPORTS)[number]>("Meters");
  const [zone, setZone] = useState("all");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [install, setInstall] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const meters = useMemo(() => {
    return (data?.meters ?? []).filter((m) => {
      if (zone !== "all" && String(m.zone_id ?? "") !== zone) return false;
      if (type !== "all" && m.type !== type) return false;
      if (status !== "all" && m.status !== status) return false;
      if (install !== "all" && m.installation_status !== install) return false;
      if (from && m.created_at < from) return false;
      if (to && m.created_at > `${to}T23:59:59`) return false;
      return true;
    });
  }, [data, zone, type, status, install, from, to]);

  const residents = useMemo(
    () => (data?.residents ?? []).filter((r) => zone === "all" || String(r.zone_id ?? "") === zone),
    [data, zone],
  );

  const table = useMemo(() => {
    if (report === "Meters") {
      return {
        headers: ["Meter number", "Type", "Zone", "Resident", "Status", "Installation"],
        rows: meters.map((m) => [
          m.meter_number,
          titleCase(m.type),
          m.zone_name ?? "—",
          m.resident_name ?? "—",
          titleCase(m.status),
          installationLabel(m.installation_status),
        ]),
      };
    }
    if (report === "Residents") {
      return {
        headers: ["Resident", "Zone", "Meter", "Account status"],
        rows: residents.map((r) => [
          r.name ?? r.email ?? "—",
          r.zone_name ?? "—",
          r.meter_number ?? "—",
          titleCase(r.status),
        ]),
      };
    }
    if (report === "Zones") {
      return {
        headers: ["Zone", "Residents", "Meters", "Active", "Inactive"],
        rows: (data?.zones ?? []).map((z) => {
          const zoneMeters = (data?.meters ?? []).filter((m) => m.zone_id === z.zone_id);
          return [
            z.zone_name,
            String(z.resident_count),
            String(z.meter_count),
            String(zoneMeters.filter((m) => m.status === "active").length),
            String(zoneMeters.filter((m) => m.status !== "active").length),
          ];
        }),
      };
    }
    const meterLookup = new Map((data?.meters ?? []).map((m) => [m.id, m]));
    const inRange = (value: string | null | undefined) => {
      if (!value) return !from && !to;
      if (from && value < from) return false;
      if (to && value > `${to}T23:59:59`) return false;
      return true;
    };
    if (report === "Transactions") {
      const rows = (tokensQuery.data?.tokens ?? []).filter((t) => {
        const m = meterLookup.get(t.meter_id);
        if (zone !== "all" && String(m?.zone_id ?? "") !== zone) return false;
        return inRange(t.created_at);
      });
      return {
        headers: ["Transaction", "Meter", "Resident", "Amount", "Payment status", "Token status", "Date"],
        rows: rows.map((t) => {
          const m = meterLookup.get(t.meter_id);
          return [
            t.reference ?? t.id,
            m?.meter_number ?? "—",
            m?.resident_name ?? "—",
            String(t.amount),
            titleCase(t.payment_status ?? "pending"),
            titleCase(t.status),
            formatDate(t.created_at),
          ];
        }),
      };
    }
    if (report === "Readings") {
      const rows = (readingsQuery.data?.readings ?? []).filter((r) => {
        const m = meterLookup.get(r.meter_id);
        if (zone !== "all" && String(m?.zone_id ?? "") !== zone) return false;
        return inRange(r.reading_date);
      });
      return {
        headers: ["Meter", "Resident", "Zone", "Previous", "Current", "Consumption", "Date"],
        rows: rows.map((r) => {
          const m = meterLookup.get(r.meter_id);
          return [
            m?.meter_number ?? "—",
            m?.resident_name ?? "—",
            m?.zone_name ?? "—",
            r.previous_reading == null ? "—" : String(r.previous_reading),
            String(r.reading),
            r.consumption == null ? "—" : String(r.consumption),
            formatDate(r.reading_date),
          ];
        }),
      };
    }
    if (report === "Maintenance") {
      const rows = (requestsQuery.data?.requests ?? []).filter((r) => {
        const m = r.meter_id ? meterLookup.get(r.meter_id) : undefined;
        if (zone !== "all" && String(m?.zone_id ?? "") !== zone) return false;
        return inRange(r.created_at);
      });
      return {
        headers: ["Request", "Meter", "Resident", "Issue", "Priority", "Technician", "Status", "Resolved"],
        rows: rows.map((r) => {
          const m = r.meter_id ? meterLookup.get(r.meter_id) : undefined;
          return [
            r.request_number,
            m?.meter_number ?? "—",
            m?.resident_name ?? "—",
            r.issue_type,
            titleCase(r.priority),
            r.technician_name ?? "—",
            titleCase(r.status),
            formatDate(r.completed_at),
          ];
        }),
      };
    }
    return {
      headers: ["Meter", "Resident", "Zone", "Installation status", "Installation date"],
      rows: meters.map((m) => [
        m.meter_number,
        m.resident_name ?? "—",
        m.zone_name ?? "—",
        installationLabel(m.installation_status),
        formatDate(m.installation_date),
      ]),
    };
  }, [
    report,
    meters,
    residents,
    data,
    zone,
    from,
    to,
    tokensQuery.data,
    readingsQuery.data,
    requestsQuery.data,
  ]);

  return (
    <DashboardShell
      access={access}
      title="Reports"
      description="Reports cover only the resources assigned to you."
      actions={
        <button
          className="btn-outline px-3 py-1.5 text-sm"
          disabled={table.rows.length === 0}
          onClick={() =>
            downloadCsv(`vendor-${report.toLowerCase()}-report.csv`, table.headers, table.rows)
          }
        >
          <Download className="mr-1 inline size-3.5" /> Export CSV
        </button>
      }
    >
      {error ? (
        <ErrorBlock message={(error as Error).message} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-4 pb-6">
          <div className="flex flex-wrap gap-2">
            {REPORTS.map((r) => (
              <button
                key={r}
                onClick={() => setReport(r)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                  report === r
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter by zone"
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              className="rounded-full border border-border bg-card px-4 py-2 text-sm"
            >
              <option value="all">All zones</option>
              {(data?.zones ?? []).map((z) => (
                <option key={z.zone_id} value={String(z.zone_id)}>
                  {z.zone_name}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by meter type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="rounded-full border border-border bg-card px-4 py-2 text-sm"
            >
              <option value="all">All types</option>
              <option value="electricity">Electricity</option>
              <option value="water">Water</option>
              <option value="gas">Gas</option>
            </select>
            <select
              aria-label="Filter by meter status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-full border border-border bg-card px-4 py-2 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select
              aria-label="Filter by installation status"
              value={install}
              onChange={(e) => setInstall(e.target.value)}
              className="rounded-full border border-border bg-card px-4 py-2 text-sm"
            >
              <option value="all">All installations</option>
              {INSTALLATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {installationLabel(s)}
                </option>
              ))}
            </select>
            <input
              type="date"
              aria-label="From date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-full border border-border bg-card px-4 py-2 text-sm"
            />
            <input
              type="date"
              aria-label="To date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-full border border-border bg-card px-4 py-2 text-sm"
            />
          </div>

          {table.rows.length === 0 ? (
            <EmptyState title="Nothing to report" message="No records match these filters." />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    {table.headers.map((h) => (
                      <th key={h} className="px-4 py-2">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, i) => (
                    <tr key={i} className="border-t border-border">
                      {row.map((cell, j) => (
                        <td key={j} className="px-4 py-2">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
