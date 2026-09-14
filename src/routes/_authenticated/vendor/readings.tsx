import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import {
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  Pagination,
  StatCard,
  StatusBadge,
  downloadCsv,
  formatDate,
  titleCase,
  useVendorScope,
} from "@/components/vendor/VendorUI";
import { Field, VendorModal } from "@/components/vendor/VendorModal";
import { evidenceUrl, uploadEvidence } from "@/components/vendor/evidence";
import { READING_TYPES, addVendorReading, listVendorReadings, type ReadingRow } from "@/lib/vendor-ops.functions";

const PAGE_SIZE = 10;

export const Route = createFileRoute("/_authenticated/vendor/readings")({
  head: () => ({
    meta: [
      { title: "Meter Readings · Vendor · SmatraPay" },
      { name: "description", content: "Record and review meter readings for meters on your vendor account." },
      { property: "og:title", content: "Meter Readings · Vendor · SmatraPay" },
      { property: "og:description", content: "Capture manual meter readings with photo evidence and consumption history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorReadings,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{error.message}</p>,
});

function VendorReadings() {
  const access = Route.useLoaderData();
  const queryClient = useQueryClient();
  const scope = useVendorScope();
  const fetchReadings = useServerFn(listVendorReadings);
  const addReading = useServerFn(addVendorReading);

  const readingsQuery = useQuery({
    queryKey: ["vendor-readings"],
    queryFn: () => fetchReadings({ data: {} }),
  });

  const [search, setSearch] = useState("");
  const [zone, setZone] = useState("all");
  const [type, setType] = useState("all");
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState<ReadingRow | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const [meterId, setMeterId] = useState("");
  const [reading, setReading] = useState("");
  const [readingDate, setReadingDate] = useState(new Date().toISOString().slice(0, 10));
  const [readingType, setReadingType] = useState<(typeof READING_TYPES)[number]>("manual");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const meters = scope.data?.meters ?? [];
  const meterById = useMemo(() => new Map(meters.map((m) => [m.id, m])), [meters]);
  const rows = readingsQuery.data?.readings ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const m = meterById.get(r.meter_id);
      if (zone !== "all" && String(m?.zone_id ?? "") !== zone) return false;
      if (type !== "all" && r.reading_type !== type) return false;
      if (!q) return true;
      return [m?.meter_number ?? "", m?.resident_name ?? "", r.id].join(" ").toLowerCase().includes(q);
    });
  }, [rows, search, zone, type, meterById]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selectedMeter = meterId ? meterById.get(meterId) : undefined;

  const mutation = useMutation({
    mutationFn: async () => {
      let path: string | undefined;
      if (file) {
        setUploading(true);
        try {
          path = await uploadEvidence(file, "readings");
        } finally {
          setUploading(false);
        }
      }
      return addReading({
        data: {
          meter_id: meterId,
          resident_id: selectedMeter?.resident_id ?? null,
          reading: Number(reading),
          reading_date: readingDate,
          reading_type: readingType,
          notes: notes.trim() || undefined,
          ...(path ? { photo_paths: [path] } : {}),
        },
      });
    },
    onSuccess: async (res) => {
      setAdding(false);
      setReading("");
      setNotes("");
      setFile(null);
      setMeterId("");
      await queryClient.invalidateQueries({ queryKey: ["vendor-readings"] });
      toast[res.status === "flagged" ? "warning" : "success"](
        res.status === "flagged"
          ? "Reading saved and flagged for review — it is lower than the previous reading"
          : "Reading recorded",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openDetail = async (row: ReadingRow) => {
    setDetail(row);
    setPhotoUrl(null);
    const first = row.photo_paths[0];
    if (first) setPhotoUrl(await evidenceUrl(first));
  };

  const zones = scope.data?.zones ?? [];

  return (
    <DashboardShell
      access={access}
      title="Meter Readings"
      description="Record readings and track consumption for your meters."
      actions={
        <div className="flex gap-2">
          <button
            className="btn-outline px-3 py-1.5 text-sm"
            onClick={() =>
              downloadCsv(
                "vendor-meter-readings.csv",
                ["Reading", "Meter", "Resident", "Zone", "Previous", "Reading", "Consumption", "Type", "Date"],
                filtered.map((r) => {
                  const m = meterById.get(r.meter_id);
                  return [
                    r.id.slice(0, 8),
                    m?.meter_number ?? "",
                    m?.resident_name ?? "",
                    m?.zone_name ?? "",
                    r.previous_reading ?? "",
                    r.reading,
                    r.consumption ?? "",
                    r.reading_type,
                    r.reading_date,
                  ];
                }),
              )
            }
          >
            Export CSV
          </button>
          <button className="btn-primary px-3 py-1.5 text-sm" onClick={() => setAdding(true)}>
            Add reading
          </button>
        </div>
      }
    >
      {scope.error || readingsQuery.error ? (
        <ErrorBlock message={((scope.error ?? readingsQuery.error) as Error).message} />
      ) : scope.isLoading || readingsQuery.isLoading ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-4 pb-8">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Readings recorded" value={rows.length} />
            <StatCard label="Flagged for review" value={rows.filter((r) => r.status === "flagged").length} />
            <StatCard label="Meters with readings" value={new Set(rows.map((r) => r.meter_id)).size} />
            <StatCard
              label="Total consumption"
              value={rows.reduce((sum, r) => sum + Math.max(0, r.consumption ?? 0), 0).toFixed(2)}
            />
          </div>

          <div className="grid gap-2 rounded-2xl border border-border bg-card p-3 md:grid-cols-3">
            <input
              className="input"
              placeholder="Search meter or resident"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              aria-label="Search readings"
            />
            <select className="input" value={zone} onChange={(e) => setZone(e.target.value)} aria-label="Zone">
              <option value="all">All zones</option>
              {zones.map((z) => (
                <option key={z.zone_id} value={String(z.zone_id)}>
                  {z.zone_name}
                </option>
              ))}
            </select>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)} aria-label="Reading type">
              <option value="all">All reading types</option>
              {READING_TYPES.map((t) => (
                <option key={t} value={t}>
                  {titleCase(t)}
                </option>
              ))}
            </select>
          </div>

          {current.length === 0 ? (
            <EmptyState title="No readings" message="No meter readings have been recorded yet." />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full min-w-[60rem] text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Reading ID</th>
                    <th className="px-4 py-3">Meter</th>
                    <th className="px-4 py-3">Resident</th>
                    <th className="px-4 py-3">Zone</th>
                    <th className="px-4 py-3">Reading</th>
                    <th className="px-4 py-3">Unit</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Recorded by</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {current.map((r) => {
                    const m = meterById.get(r.meter_id);
                    return (
                      <tr key={r.id} className="border-t border-border">
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.id.slice(0, 8)}</td>
                        <td className="px-4 py-3 font-semibold text-foreground">{m?.meter_number ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{m?.resident_name ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{m?.zone_name ?? "—"}</td>
                        <td className="px-4 py-3 text-foreground">{r.reading}</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.unit}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(r.reading_date)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{titleCase(r.reading_type)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.recorded_by_name ?? "—"}</td>
                        <td className="px-4 py-3">
                          <StatusBadge value={r.status} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button className="btn-outline px-3 py-1 text-xs" onClick={() => void openDetail(r)}>
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Pagination page={page} pageCount={pageCount} onPage={setPage} total={filtered.length} />
            </div>
          )}
        </div>
      )}

      {adding && (
        <VendorModal title="Add meter reading" onClose={() => setAdding(false)}>
          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase text-muted-foreground">
              Meter
              <select className="input mt-1" value={meterId} onChange={(e) => setMeterId(e.target.value)}>
                <option value="">Select a meter</option>
                {meters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.meter_number} — {m.resident_name ?? "unassigned"}
                  </option>
                ))}
              </select>
            </label>
            <Field label="Resident" value={selectedMeter?.resident_name ?? "—"} />
            <label className="block text-xs font-semibold uppercase text-muted-foreground">
              Reading
              <input
                className="input mt-1"
                type="number"
                min="0"
                step="0.01"
                value={reading}
                onChange={(e) => setReading(e.target.value)}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold uppercase text-muted-foreground">
                Reading date
                <input
                  className="input mt-1"
                  type="date"
                  value={readingDate}
                  onChange={(e) => setReadingDate(e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold uppercase text-muted-foreground">
                Reading type
                <select
                  className="input mt-1"
                  value={readingType}
                  onChange={(e) => setReadingType(e.target.value as (typeof READING_TYPES)[number])}
                >
                  {READING_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {titleCase(t)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-xs font-semibold uppercase text-muted-foreground">
              Notes
              <textarea className="input mt-1" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <label className="block text-xs font-semibold uppercase text-muted-foreground">
              Meter photo (optional)
              <input
                className="input mt-1"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-outline px-3 py-1.5 text-sm" onClick={() => setAdding(false)}>
                Cancel
              </button>
              <button
                className="btn-primary px-3 py-1.5 text-sm"
                disabled={!meterId || reading === "" || Number(reading) < 0 || mutation.isPending || uploading}
                onClick={() => mutation.mutate()}
              >
                {uploading ? "Uploading…" : mutation.isPending ? "Saving…" : "Save reading"}
              </button>
            </div>
          </div>
        </VendorModal>
      )}

      {detail && (
        <VendorModal title="Reading details" onClose={() => setDetail(null)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Meter" value={meterById.get(detail.meter_id)?.meter_number ?? "—"} />
            <Field label="Resident" value={meterById.get(detail.meter_id)?.resident_name ?? "—"} />
            <Field label="Reading" value={`${detail.reading} ${detail.unit}`} />
            <Field label="Previous reading" value={detail.previous_reading ?? "—"} />
            <Field label="Consumption" value={detail.consumption ?? "—"} />
            <Field label="Reading type" value={titleCase(detail.reading_type)} />
            <Field label="Reading date" value={formatDate(detail.reading_date)} />
            <Field label="Recorded by" value={detail.recorded_by_name ?? "—"} />
            <Field label="Status" value={<StatusBadge value={detail.status} />} />
          </div>
          {detail.notes && <p className="mt-3 text-sm text-muted-foreground">{detail.notes}</p>}
          {photoUrl && (
            <img src={photoUrl} alt="Meter reading evidence" className="mt-3 w-full rounded-xl border border-border" />
          )}
        </VendorModal>
      )}
    </DashboardShell>
  );
}
