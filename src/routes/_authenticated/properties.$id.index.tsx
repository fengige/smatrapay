import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { z } from "zod";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  History,
  Home,
  Layers,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  Upload,
  UserCog,
  UserPlus,
  Users as UsersIcon,
  X,
} from "lucide-react";
import jsPDF from "jspdf";
import { toast } from "sonner";

import {
  assignUnit,
  deleteAssignment,
  deleteProperty,
  deleteUnit,
  endAssignment,
  getProperty,
  importAssignments,
  listAssignableUsers,
  upsertUnit,
} from "@/lib/properties.functions";
import { PortalLayout } from "@/components/PortalLayout";

export const Route = createFileRoute("/_authenticated/properties/$id/")({
  head: () => ({
    meta: [
      { title: "Property Details · SmatraPay" },
      {
        name: "description",
        content:
          "Property detail view with units, unit assignments, residents, landlords and audit history.",
      },
      { property: "og:title", content: "Property Details · SmatraPay" },
      {
        property: "og:description",
        content: "Units, residents, landlords and audit history for a SmatraPay property.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: z.object({
    success: z.enum(["created", "updated"]).optional(),
  }),
  component: PropertyDetailPage,
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-10 text-sm">Property not found.</div>,
});

type Unit = {
  id: string;
  unit_number: string;
  building: string | null;
  unit_type: string | null;
  bedrooms: number | null;
  floor: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type Assignment = {
  id: string;
  unit_id: string;
  user_id: string;
  role: string;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  created_at: string;
};

type Person = { id: string; name: string | null; email: string | null; phone: string | null; status: string; role?: string };

type Landlord = Person & { profile_image: string | null };

const TABS = [
  { id: "units", label: "Units", icon: Layers },
  { id: "timeline", label: "Unit Timeline", icon: History },
  { id: "residents", label: "Residents", icon: UsersIcon },
  { id: "landlords", label: "Landlord detail", icon: Building2 },
  { id: "audit", label: "Status & Audit Logs", icon: ClipboardList },
] as const;

type TabId = (typeof TABS)[number]["id"];

type UnitForm = {
  open: boolean;
  id?: string;
  unit_number: string;
  building: string;
  unit_type: string;
  bedrooms: string;
  floor: string;
  status: string;
};

const emptyUnitForm: UnitForm = {
  open: false,
  unit_number: "",
  building: "",
  unit_type: "",
  bedrooms: "",
  floor: "",
  status: "vacant",
};

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

function Pill({ value }: { value: string }) {
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

function fmt(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "property";
}

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

function PropertyDetailPage() {
  const { id } = Route.useParams();
  const { success } = Route.useSearch();
  const router = useRouter();
  const queryClient = useQueryClient();

  const fetchProperty = useServerFn(getProperty);
  const fetchPeople = useServerFn(listAssignableUsers);
  const saveUnit = useServerFn(upsertUnit);
  const removeUnit = useServerFn(deleteUnit);
  const createAssignment = useServerFn(assignUnit);
  const closeAssignment = useServerFn(endAssignment);
  const removeAssignment = useServerFn(deleteAssignment);
  const runImport = useServerFn(importAssignments);
  const removeProperty = useServerFn(deleteProperty);

  const [tab, setTab] = useState<TabId>("units");
  const [query, setQuery] = useState("");
  const [unitForm, setUnitForm] = useState<UnitForm>({ ...emptyUnitForm });
  const [assignFor, setAssignFor] = useState<Unit | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(
    success === "created" ? "Property created successfully." : success === "updated" ? "Property updated successfully." : null,
  );

  const dismissSuccess = () => {
    setSuccessBanner(null);
    void router.navigate({
      to: "/properties/$id",
      params: { id },
      search: {},
      replace: true,
    });
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["properties", id],
    queryFn: () => fetchProperty({ data: { id } }),
    retry: (count, err) =>
      !/not found/i.test((err as Error)?.message ?? "") && count < 2,
  });
  const notFound = /not found/i.test((error as Error | null)?.message ?? "");
  const peopleQuery = useQuery({
    queryKey: ["assignable-people"],
    queryFn: () => fetchPeople(),
  });

  const property = (data?.property ?? null) as Record<string, string | null> | null;
  const landlord = (data?.landlord ?? null) as Landlord | null;
  const units = useMemo(() => (data?.units ?? []) as unknown as Unit[], [data]);
  const assignments = useMemo(() => (data?.assignments ?? []) as unknown as Assignment[], [data]);
  const people = useMemo(() => (data?.people ?? []) as unknown as Person[], [data]);
  const directory = useMemo(
    () => ((peopleQuery.data?.people ?? []) as unknown as Person[]),
    [peopleQuery.data],
  );

  const personById = useMemo(() => {
    const map = new Map<string, Person>();
    for (const p of [...people, ...directory]) map.set(p.id, p);
    return map;
  }, [people, directory]);

  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const label = (userId: string) => {
    const person = personById.get(userId);
    return person?.name || person?.email || userId.slice(0, 8);
  };

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["properties"] });
  };

  const unitMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => saveUnit({ data: payload } as never),
    onSuccess: async () => {
      toast.success("Unit saved");
      setUnitForm({ ...emptyUnitForm });
      await invalidate();
    },
    onError: (err: Error) => toast.error(err.message || "Could not save unit"),
  });

  const unitDelete = useMutation({
    mutationFn: (unitId: string) => removeUnit({ data: { id: unitId } } as never),
    onSuccess: async () => {
      toast.success("Unit removed");
      await invalidate();
    },
    onError: (err: Error) => toast.error(err.message || "Could not remove unit"),
  });

  const propertyDelete = useMutation({
    mutationFn: () => removeProperty({ data: { id } } as never),
    onSuccess: () => {
      setDeleteOpen(false);
      toast.success("Property deleted", {
        description: `${property?.["name"] ?? "The property"} was removed.`,
      });
      queryClient.removeQueries({ queryKey: ["properties", id] });
      void queryClient.invalidateQueries({ queryKey: ["properties"] });
      void router.navigate({ to: "/properties", search: { page: 1, limit: 10 } });
    },
    onError: (err: Error) => toast.error(err.message || "Could not delete property"),
  });

  const assignMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => createAssignment({ data: payload } as never),
    onSuccess: async () => {
      toast.success("Assignment created");
      setAssignFor(null);
      await invalidate();
    },
    onError: (err: Error) => toast.error(err.message || "Could not assign this unit"),
  });

  const endMutation = useMutation({
    mutationFn: (assignmentId: string) => closeAssignment({ data: { id: assignmentId } } as never),
    onSuccess: async () => {
      toast.success("Assignment ended");
      await invalidate();
    },
    onError: (err: Error) => toast.error(err.message || "Could not end assignment"),
  });

  const removeMutation = useMutation({
    mutationFn: (assignmentId: string) => removeAssignment({ data: { id: assignmentId } } as never),
    onSuccess: async () => {
      toast.success("Assignment deleted");
      await invalidate();
    },
    onError: (err: Error) => toast.error(err.message || "Could not delete assignment"),
  });

  const current = assignments.filter((a) => !a.end_date);
  const previous = assignments.filter((a) => a.end_date);
  const residentsCurrent = current.filter((a) => a.role === "resident");
  const landlordsCurrent = current.filter((a) => a.role === "landlord");

  const term = query.trim().toLowerCase();
  const match = (values: (string | null | undefined)[]) =>
    !term || values.filter(Boolean).join(" ").toLowerCase().includes(term);

  const visibleUnits = units.filter((u) =>
    match([
      u.unit_number,
      u.building,
      u.unit_type,
      u.status,
      ...current.filter((a) => a.unit_id === u.id).map((a) => label(a.user_id)),
    ]),
  );

  const roleRows = (role: string) =>
    assignments
      .filter((a) => a.role === role)
      .filter((a) =>
        match([label(a.user_id), unitById.get(a.unit_id)?.unit_number, a.end_date ? "previous" : "current"]),
      );

  const auditEvents = useMemo(() => {
    const events: { date: string; actor: string; action: string; detail: string }[] = [];
    if (property?.["created_at"]) {
      events.push({
        date: property["created_at"] as string,
        actor: "System",
        action: "Property created",
        detail: `${property["name"]} added to the portfolio`,
      });
    }
    if (property?.["updated_at"] && property["updated_at"] !== property["created_at"]) {
      events.push({
        date: property["updated_at"] as string,
        actor: "System",
        action: "Property updated",
        detail: `Status ${property["status"]}`,
      });
    }
    for (const unit of units) {
      events.push({
        date: unit.created_at,
        actor: "System",
        action: "Unit added",
        detail: `Unit ${unit.unit_number}${unit.building ? ` · ${unit.building}` : ""}`,
      });
    }
    for (const a of assignments) {
      events.push({
        date: a.start_date,
        actor: label(a.user_id),
        action: a.role === "resident" ? "Resident assigned" : "Landlord assigned",
        detail: `Unit ${unitById.get(a.unit_id)?.unit_number ?? "—"}`,
      });
      if (a.end_date) {
        events.push({
          date: a.end_date,
          actor: label(a.user_id),
          action: "Assignment ended",
          detail: `Unit ${unitById.get(a.unit_id)?.unit_number ?? "—"}`,
        });
      }
    }
    return events.sort((a, b) => (a.date < b.date ? 1 : -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property, units, assignments, personById]);

  const visibleAudit = auditEvents.filter((e) => match([e.actor, e.action, e.detail]));

  const unitState = (status: string) =>
    status === "archived" ? "archived" : status === "maintenance" ? "blocked" : "active";

  const timeline = useMemo(() => {
    const rows: {
      unit: string;
      building: string;
      date: string;
      state: string;
      event: string;
      detail: string;
    }[] = [];
    for (const u of units) {
      rows.push({
        unit: u.unit_number,
        building: u.building ?? "",
        date: u.created_at,
        state: "active",
        event: "Unit created",
        detail: [u.unit_type, u.floor ? `floor ${u.floor}` : ""].filter(Boolean).join(" · ") || "—",
      });
      const unitAssignments = assignments
        .filter((a) => a.unit_id === u.id)
        .sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
      for (const a of unitAssignments) {
        rows.push({
          unit: u.unit_number,
          building: u.building ?? "",
          date: a.start_date,
          state: "active",
          event: a.role === "resident" ? "Resident assigned" : "Landlord assigned",
          detail: `${label(a.user_id)}${a.notes ? ` — ${a.notes}` : ""}`,
        });
        if (a.end_date) {
          rows.push({
            unit: u.unit_number,
            building: u.building ?? "",
            date: a.end_date,
            state: "archived",
            event: "Assignment ended",
            detail: `${label(a.user_id)} (${a.role})`,
          });
        }
      }
      rows.push({
        unit: u.unit_number,
        building: u.building ?? "",
        date: u.updated_at,
        state: unitState(u.status),
        event: "Current status",
        detail: u.status,
      });
    }
    return rows.sort((a, b) =>
      a.unit === b.unit ? (a.date < b.date ? -1 : 1) : a.unit.localeCompare(b.unit),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units, assignments, personById]);

  const visibleTimeline = timeline.filter((r) =>
    match([r.unit, r.building, r.state, r.event, r.detail]),
  );
  const timelineByUnit = useMemo(() => {
    const map = new Map<string, typeof visibleTimeline>();
    for (const row of visibleTimeline) {
      const list = map.get(row.unit) ?? [];
      list.push(row);
      map.set(row.unit, list);
    }
    return [...map.entries()];
  }, [visibleTimeline]);

  const exportSet = () => {
    if (tab === "units") {
      return {
        name: "units",
        header: ["Unit", "Building", "Type", "Bedrooms", "Status", "Current occupants"],
        rows: visibleUnits.map((u) => [
          u.unit_number,
          u.building ?? "",
          u.unit_type ?? "",
          u.bedrooms == null ? "" : String(u.bedrooms),
          u.status,
          current
            .filter((a) => a.unit_id === u.id)
            .map((a) => `${label(a.user_id)} (${a.role})`)
            .join(" | "),
        ]),
      };
    }
    if (tab === "audit") {
      return {
        name: "audit-logs",
        header: ["Date", "Actor", "Action", "Detail"],
        rows: visibleAudit.map((e) => [fmt(e.date), e.actor, e.action, e.detail]),
      };
    }
    if (tab === "timeline") {
      return {
        name: "unit-timeline",
        header: ["Unit", "Building", "Date", "State", "Event", "Detail"],
        rows: visibleTimeline.map((r) => [
          r.unit,
          r.building,
          fmt(r.date),
          r.state,
          r.event,
          r.detail,
        ]),
      };
    }
    const role = tab === "landlords" ? "landlord" : "resident";
    return {
      name: tab,
      header: ["Name", "Email", "Phone", "Unit", "Start", "End", "State"],
      rows: roleRows(role).map((a) => {
        const person = personById.get(a.user_id);
        return [
          person?.name ?? "",
          person?.email ?? "",
          person?.phone ?? "",
          unitById.get(a.unit_id)?.unit_number ?? "",
          a.start_date,
          a.end_date ?? "",
          a.end_date ? "Previous" : "Current",
        ];
      }),
    };
  };

  const exportCsv = () => {
    const { header, rows, name } = exportSet();
    const csv = [header, ...rows]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `smatrapay-${slug(property?.["name"] ?? "property")}-${name}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const { header, rows, name } = exportSet();
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(15);
    doc.text(`${property?.["name"] ?? "Property"} — ${name.replace("-", " ")}`, 40, 44);
    doc.setFontSize(9);
    doc.text(`Exported ${new Date().toLocaleString()} · ${rows.length} records`, 40, 60);
    let y = 84;
    doc.text(header.join("  |  "), 40, y);
    y += 14;
    for (const row of rows) {
      if (y > 540) {
        doc.addPage();
        y = 50;
      }
      doc.text(row.map((c) => String(c).slice(0, 32)).join("  |  ").slice(0, 170), 40, y);
      y += 14;
    }
    doc.save(`smatrapay-${slug(property?.["name"] ?? "property")}-${name}.pdf`);
  };

  const stats = [
    { label: "Units", value: units.length, icon: Layers },
    { label: "Current residents", value: residentsCurrent.length, icon: UsersIcon },
    { label: "Current landlords", value: landlordsCurrent.length, icon: Building2 },
    { label: "Past assignments", value: previous.length, icon: UserCog },
  ];

  return (
    <PortalLayout
      roles={["admin"]}
      title={property?.["name"] ?? "Property"}
      description="Units, assignments, occupants and audit history"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/properties"
            search={{ page: 1, limit: 10 }}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10"
          >
            <ArrowLeft className="size-4" /> Back
          </Link>
          <Link
            to="/properties/$id/edit"
            params={{ id }}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10"
          >
            <Pencil className="size-4" /> Edit
          </Link>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10"
          >
            <Download className="size-4" /> CSV
          </button>
          <button
            type="button"
            onClick={exportPdf}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10"
          >
            <FileText className="size-4" /> PDF
          </button>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2 text-sm font-semibold text-destructive hover:bg-destructive/15"
          >
            <Trash2 className="size-4" /> Delete
          </button>
        </div>
      }
    >
      {isLoading ? (
        <div className="p-10 text-center text-muted-foreground">
          <Loader2 className="mx-auto size-5 animate-spin" />
        </div>
      ) : notFound ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <p className="text-sm font-semibold text-foreground">This property no longer exists.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            It may have been deleted. Head back to the properties list.
          </p>
          <button
            type="button"
            onClick={() => void router.navigate({ to: "/properties", search: { page: 1, limit: 10 } })}
            className="mt-5 inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Back to properties
          </button>
        </div>
      ) : error ? (
        <p className="p-6 text-sm text-destructive">{(error as Error).message}</p>
      ) : (
        <div className="space-y-5">
          {successBanner && (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-emerald-700">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
              <div className="flex-1 text-sm font-medium">{successBanner}</div>
              <button
                type="button"
                onClick={dismissSuccess}
                className="rounded-md p-1 hover:bg-emerald-500/20"
                aria-label="Dismiss"
              >
                <X className="size-4" />
              </button>
            </div>
          )}
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Home className="size-6" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-bold text-foreground">
                  {property?.["name"]}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {[
                    property?.["code"],
                    property?.["address_line1"],
                    property?.["city"],
                    property?.["country"],
                  ]
                    .filter(Boolean)
                    .join(" · ") || "No address recorded"}
                </p>
              </div>
              <Pill value={property?.["status"] ?? "active"} />
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className="rounded-xl border border-border bg-background p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {s.label}
                    </p>
                    <s.icon className="size-4 text-muted-foreground" />
                  </div>
                  <p className="mt-1.5 text-2xl font-bold text-foreground">{s.value}</p>
                </div>
              ))}
            </div>
          </div>

          <section className="rounded-2xl border border-border bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
                    tab === t.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent/10"
                  }`}
                >
                  <t.icon className="size-4" /> {t.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
              <div className="flex min-w-[220px] flex-1 items-stretch overflow-hidden rounded-lg border border-border focus-within:border-primary">
                <span className="flex items-center bg-muted/50 px-3 text-muted-foreground">
                  <Search className="size-4" />
                </span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search within this tab"
                  className="w-full bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/70"
                />
              </div>
              {tab === "units" && (
                <>
                  <button
                    type="button"
                    onClick={() => setImportOpen(true)}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-semibold hover:bg-accent/10"
                  >
                    <Upload className="size-4" /> Import CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnitForm({ ...emptyUnitForm, open: true })}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                  >
                    <Plus className="size-4" /> Add Unit
                  </button>
                </>
              )}
            </div>

            <div className="overflow-x-auto">
              {tab === "units" && (
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Unit</th>
                      <th className="px-4 py-3 font-semibold">Building</th>
                      <th className="px-4 py-3 font-semibold">Type</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Current assignments</th>
                      <th className="px-4 py-3 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!visibleUnits.length && (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                          No units yet. Use “Add Unit” to create one.
                        </td>
                      </tr>
                    )}
                    {visibleUnits.map((u) => {
                      const rows = current.filter((a) => a.unit_id === u.id);
                      const past = previous.filter((a) => a.unit_id === u.id);
                      return (
                        <tr key={u.id} className="border-t border-border align-top">
                          <td className="px-4 py-3 font-semibold text-foreground">
                            {u.unit_number}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{u.building || "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {u.unit_type || "—"}
                            {u.bedrooms != null && ` · ${u.bedrooms} bed`}
                          </td>
                          <td className="px-4 py-3">
                            <Pill value={u.status} />
                          </td>
                          <td className="px-4 py-3">
                            {rows.length ? (
                              <ul className="space-y-1">
                                {rows.map((a) => (
                                  <li key={a.id} className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium text-foreground">
                                      {label(a.user_id)}
                                    </span>
                                    <span className="rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-semibold capitalize">
                                      {a.role}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      since {fmt(a.start_date)}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => endMutation.mutate(a.id)}
                                      className="text-xs font-semibold text-primary hover:underline"
                                    >
                                      End
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className="text-muted-foreground">Vacant</span>
                            )}
                            {past.length > 0 && (
                              <details className="mt-2">
                                <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                                  Previous ({past.length})
                                </summary>
                                <ul className="mt-1 space-y-1">
                                  {past.map((a) => (
                                    <li
                                      key={a.id}
                                      className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                                    >
                                      <span>{label(a.user_id)}</span>
                                      <span className="capitalize">({a.role})</span>
                                      <span>
                                        {fmt(a.start_date)} – {fmt(a.end_date)}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => removeMutation.mutate(a.id)}
                                        className="font-semibold text-destructive hover:underline"
                                      >
                                        Delete
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setAssignFor(u)}
                                aria-label={`Assign unit ${u.unit_number}`}
                                className="rounded-lg border border-border p-2 hover:bg-accent/10"
                              >
                                <UserPlus className="size-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setUnitForm({
                                    open: true,
                                    id: u.id,
                                    unit_number: u.unit_number,
                                    building: u.building ?? "",
                                    unit_type: u.unit_type ?? "",
                                    bedrooms: u.bedrooms == null ? "" : String(u.bedrooms),
                                    floor: u.floor ?? "",
                                    status: u.status,
                                  })
                                }
                                aria-label={`Edit unit ${u.unit_number}`}
                                className="rounded-lg border border-border p-2 hover:bg-accent/10"
                              >
                                <Pencil className="size-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => unitDelete.mutate(u.id)}
                                aria-label={`Delete unit ${u.unit_number}`}
                                className="rounded-lg border border-border p-2 text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {tab === "timeline" && (
                <div className="space-y-5 p-4">
                  {!timelineByUnit.length && (
                    <p className="py-10 text-center text-muted-foreground">
                      No unit history yet.
                    </p>
                  )}
                  {timelineByUnit.map(([unitNumber, rows]) => (
                    <div key={unitNumber} className="rounded-xl border border-border bg-background p-4">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-bold text-foreground">Unit {unitNumber}</h4>
                        {rows[0]?.building && (
                          <span className="text-xs text-muted-foreground">{rows[0].building}</span>
                        )}
                        <Pill value={rows[rows.length - 1]?.state ?? "active"} />
                      </div>
                      <ol className="relative space-y-4 border-l border-border pl-5">
                        {rows.map((r, i) => (
                          <li key={`${unitNumber}-${i}`} className="relative">
                            <span
                              className={`absolute -left-[1.4rem] top-1 size-2.5 rounded-full ${
                                r.state === "archived"
                                  ? "bg-muted-foreground"
                                  : r.state === "blocked"
                                    ? "bg-amber-500"
                                    : "bg-emerald-500"
                              }`}
                            />
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-foreground">
                                {r.event}
                              </span>
                              <Pill value={r.state} />
                              <span className="text-xs text-muted-foreground">{fmt(r.date)}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{r.detail}</p>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              )}

              {tab === "landlords" && (
                <div className="p-4">
                  {!landlord ? (
                    <div className="rounded-xl border border-border bg-background p-8 text-center">
                      <Building2 className="mx-auto size-8 text-muted-foreground" />
                      <p className="mt-3 text-sm font-semibold text-foreground">No landlord assigned</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        This property does not have a landlord linked in the Landlord Details section.
                      </p>
                    </div>
                  ) : (
                    <div className="mx-auto max-w-2xl rounded-xl border border-border bg-background p-6">
                      <div className="flex items-start gap-4">
                        <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          {landlord.profile_image ? (
                            <img
                              src={landlord.profile_image}
                              alt={landlord.name ?? ""}
                              className="size-16 rounded-full object-cover"
                            />
                          ) : (
                            <Building2 className="size-7" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-bold text-foreground">
                              {landlord.name || "Unnamed landlord"}
                            </h3>
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
                                landlord.status === "active"
                                  ? "bg-emerald-500/12 text-emerald-600"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {landlord.status}
                            </span>
                          </div>
                          <p className="mt-0.5 text-sm text-muted-foreground">Property owner</p>
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                              <Mail className="size-4 text-muted-foreground" />
                              <div>
                                <p className="text-xs text-muted-foreground">Email</p>
                                <p className="text-sm font-medium text-foreground">
                                  {landlord.email || "—"}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                              <Phone className="size-4 text-muted-foreground" />
                              <div>
                                <p className="text-xs text-muted-foreground">Phone</p>
                                <p className="text-sm font-medium text-foreground">
                                  {landlord.phone || "—"}
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            <Link
                              to="/landlords/$id"
                              params={{ id: landlord.id }}
                              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                            >
                              View landlord profile
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === "residents" && (
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Resident</th>
                      <th className="px-4 py-3 font-semibold">Phone</th>
                      <th className="px-4 py-3 font-semibold">Unit</th>
                      <th className="px-4 py-3 font-semibold">Start</th>
                      <th className="px-4 py-3 font-semibold">End</th>
                      <th className="px-4 py-3 font-semibold">State</th>
                      <th className="px-4 py-3 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!roleRows("resident").length && (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                          No residents assigned to this property yet.
                        </td>
                      </tr>
                    )}
                    {roleRows("resident").map((a) => {
                      const person = personById.get(a.user_id);
                      return (
                        <tr key={a.id} className="border-t border-border">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-foreground">{person?.name || "—"}</p>
                            <p className="text-xs text-muted-foreground">{person?.email}</p>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{person?.phone || "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {unitById.get(a.unit_id)?.unit_number ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{fmt(a.start_date)}</td>
                          <td className="px-4 py-3 text-muted-foreground">{fmt(a.end_date)}</td>
                          <td className="px-4 py-3">
                            <Pill value={a.end_date ? "archived" : "active"} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            {a.end_date ? (
                              <button
                                type="button"
                                onClick={() => removeMutation.mutate(a.id)}
                                className="text-sm font-semibold text-destructive hover:underline"
                              >
                                Delete
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => endMutation.mutate(a.id)}
                                className="text-sm font-semibold text-primary hover:underline"
                              >
                                End assignment
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {tab === "audit" && (
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Date</th>
                      <th className="px-4 py-3 font-semibold">Actor</th>
                      <th className="px-4 py-3 font-semibold">Action</th>
                      <th className="px-4 py-3 font-semibold">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!visibleAudit.length && (
                      <tr>
                        <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                          No audit events yet.
                        </td>
                      </tr>
                    )}
                    {visibleAudit.map((e, i) => (
                      <tr key={`${e.date}-${i}`} className="border-t border-border">
                        <td className="px-4 py-3 text-muted-foreground">{fmt(e.date)}</td>
                        <td className="px-4 py-3 font-semibold text-foreground">{e.actor}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
                            {e.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{e.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      )}

      {unitForm.open && (
        <Modal title={unitForm.id ? "Edit unit" : "Add unit"} onClose={() => setUnitForm({ ...emptyUnitForm })}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!unitForm.unit_number.trim()) {
                toast.error("Unit number is required");
                return;
              }
              unitMutation.mutate({
                ...(unitForm.id ? { id: unitForm.id } : {}),
                property_id: id,
                unit_number: unitForm.unit_number.trim(),
                building: unitForm.building.trim() || null,
                unit_type: unitForm.unit_type.trim() || null,
                bedrooms: unitForm.bedrooms ? Number(unitForm.bedrooms) : null,
                floor: unitForm.floor.trim() || null,
                status: unitForm.status,
              });
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className={inputClass}
                placeholder="Unit number *"
                value={unitForm.unit_number ?? ""}
                onChange={(e) => setUnitForm((p) => ({ ...p, unit_number: e.target.value }))}
              />
              <input
                className={inputClass}
                placeholder="Building"
                value={unitForm.building ?? ""}
                onChange={(e) => setUnitForm((p) => ({ ...p, building: e.target.value }))}
              />
              <input
                className={inputClass}
                placeholder="Unit type (Studio, 2BR…)"
                value={unitForm.unit_type ?? ""}
                onChange={(e) => setUnitForm((p) => ({ ...p, unit_type: e.target.value }))}
              />
              <input
                className={inputClass}
                type="number"
                min={0}
                placeholder="Bedrooms"
                value={unitForm.bedrooms}
                onChange={(e) => setUnitForm((p) => ({ ...p, bedrooms: e.target.value }))}
              />
              <input
                className={inputClass}
                placeholder="Floor"
                value={unitForm.floor ?? ""}
                onChange={(e) => setUnitForm((p) => ({ ...p, floor: e.target.value }))}
              />
              <select
                className={inputClass}
                value={unitForm.status}
                onChange={(e) => setUnitForm((p) => ({ ...p, status: e.target.value }))}
              >
                <option value="vacant">Vacant</option>
                <option value="occupied">Occupied</option>
                <option value="maintenance">Maintenance</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={unitMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {unitMutation.isPending && <Loader2 className="size-4 animate-spin" />} Save unit
            </button>
          </form>
        </Modal>
      )}

      {assignFor && (
        <Modal title={`Assign unit ${assignFor.unit_number}`} onClose={() => setAssignFor(null)}>
          <AssignForm
            pending={assignMutation.isPending}
            people={directory}
            onSubmit={(payload) =>
              assignMutation.mutate({ ...payload, unit_id: assignFor.id })
            }
          />
        </Modal>
      )}

      {importOpen && (
        <Modal title="Bulk import unit assignments" onClose={() => setImportOpen(false)}>
          <ImportForm
            propertyId={id}
            run={(payload) => runImport({ data: payload } as never) as Promise<ImportResult>}
            onImported={invalidate}
          />
        </Modal>
      )}

      {deleteOpen && (
        <Modal title="Delete property" onClose={() => !propertyDelete.isPending && setDeleteOpen(false)}>
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Trash2 className="size-5" />
            </span>
            <div className="text-sm text-muted-foreground">
              <p>
                Are you sure you want to delete{" "}
                <span className="font-semibold text-foreground">{property?.["name"] ?? "this property"}</span>?
              </p>
              <p className="mt-1">
                This will permanently remove the property and its units and assignments. This action cannot be undone.
              </p>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteOpen(false)}
              disabled={propertyDelete.isPending}
              className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent/10 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => propertyDelete.mutate()}
              disabled={propertyDelete.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground shadow-sm hover:opacity-90 disabled:opacity-60"
            >
              {propertyDelete.isPending && <Loader2 className="size-4 animate-spin" />}
              {propertyDelete.isPending ? "Deleting…" : "Delete property"}
            </button>
          </div>
        </Modal>
      )}
    </PortalLayout>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button aria-label="Close" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close dialog">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AssignForm({
  people,
  pending,
  onSubmit,
}: {
  people: Person[];
  pending: boolean;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<"resident" | "landlord">("resident");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");


  const options = people.filter((p) => (p.role ?? "resident") === role);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!userId) {
          toast.error("Select a person to assign");
          return;
        }
        if (endDate && endDate < startDate) {
          toast.error("End date must be on or after the start date");
          return;
        }
        onSubmit({
          user_id: userId,
          role,
          start_date: startDate,
          end_date: endDate || null,
          notes: notes.trim() || null,
        });
      }}
    >
      <select
        className={inputClass}
        value={role}
        onChange={(e) => {
          setRole(e.target.value as "resident" | "landlord");
          setUserId("");
        }}
      >
        <option value="resident">Resident</option>
        <option value="landlord">Landlord</option>
      </select>
      <select className={inputClass} value={userId} onChange={(e) => setUserId(e.target.value)}>
        <option value="">Select {role}…</option>
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name || p.email || p.id}
          </option>
        ))}
      </select>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-semibold text-muted-foreground">
          Start date
          <input
            className={inputClass}
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-xs font-semibold text-muted-foreground">
          End date (optional)
          <input
            className={inputClass}
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
      </div>
      <input
        className={inputClass}
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {pending && <Loader2 className="size-4 animate-spin" />} Assign
      </button>
    </form>
  );
}

type ImportResult = {
  dryRun: boolean;
  imported: number;
  valid: number;
  failed: number;
  results: { line: number; ok: boolean; message: string }[];
};

const IMPORT_TEMPLATE =
  "unit_number,building,role,identifier,start_date,end_date,notes\n" +
  "A-101,Block A,resident,jane@example.com,2026-01-01,,Moved in\n" +
  "A-101,Block A,landlord,+254700000000,2025-06-01,2025-12-31,Prior owner\n";

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim().length));
}

function ImportForm({
  propertyId,
  run,
  onImported,
}: {
  propertyId: string;
  run: (payload: Record<string, unknown>) => Promise<ImportResult>;
  onImported: () => Promise<void> | void;
}) {
  const [rows, setRows] = useState<Record<string, string | null>[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const readFile = async (file: File) => {
    const text = await file.text();
    const table = parseCsv(text);
    if (table.length < 2) {
      toast.error("The CSV needs a header row and at least one data row");
      return;
    }
    const header = table[0]!.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
    const required = ["unit_number", "role", "identifier", "start_date"];
    const missing = required.filter((key) => !header.includes(key));
    if (missing.length) {
      toast.error(`Missing column(s): ${missing.join(", ")}`);
      return;
    }
    const parsed = table.slice(1).map((line) => {
      const record: Record<string, string | null> = {};
      header.forEach((key, index) => {
        const value = (line[index] ?? "").trim();
        record[key] = value === "" ? null : value;
      });
      return record;
    });
    setRows(parsed);
    setFileName(file.name);
    setResult(null);
  };

  const submit = async (dryRun: boolean) => {
    if (!rows.length) {
      toast.error("Choose a CSV file first");
      return;
    }
    setBusy(true);
    try {
      const res = await run({ property_id: propertyId, rows, dryRun });
      setResult(res);
      if (dryRun) {
        toast.success(`Validated ${res.valid} row(s), ${res.failed} with issues`);
      } else {
        toast.success(`Imported ${res.imported} assignment(s), ${res.failed} skipped`);
        await onImported();
      }
    } catch (err) {
      toast.error((err as Error).message || "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([IMPORT_TEMPLATE], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "smatrapay-unit-assignments-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Columns: <span className="font-semibold">unit_number, building, role, identifier,
        start_date, end_date, notes</span>. Identifier matches a user by email, phone or ID. Dates
        use YYYY-MM-DD. Overlapping periods for the same unit and role are rejected.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={downloadTemplate}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-accent/10"
        >
          <Download className="size-3.5" /> Template
        </button>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void readFile(file);
          }}
          className="text-xs"
        />
      </div>
      {fileName && (
        <p className="text-xs text-muted-foreground">
          {fileName} · {rows.length} row(s) ready
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !rows.length}
          onClick={() => void submit(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-accent/10 disabled:opacity-60"
        >
          {busy && <Loader2 className="size-4 animate-spin" />} Validate only
        </button>
        <button
          type="button"
          disabled={busy || !rows.length}
          onClick={() => void submit(false)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {busy && <Loader2 className="size-4 animate-spin" />} Import
        </button>
      </div>
      {result && (
        <div className="max-h-60 overflow-auto rounded-xl border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Row</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Message</th>
              </tr>
            </thead>
            <tbody>
              {result.results.map((r) => (
                <tr key={r.line} className="border-t border-border">
                  <td className="px-3 py-2">{r.line}</td>
                  <td
                    className={`px-3 py-2 font-semibold ${
                      r.ok ? "text-emerald-600" : "text-destructive"
                    }`}
                  >
                    {r.ok ? (result.dryRun ? "Valid" : "Imported") : "Skipped"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
