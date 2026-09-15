import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  ClipboardList,
  History,
  Images,
  Layers,
  MapPin,
  Users as UsersIcon,
} from "lucide-react";
import { toast } from "sonner";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import {
  addVendorPropertyPhoto,
  deleteVendorPropertyPhoto,
  getVendorProperty,
  listVendorPropertyOptions,
  setVendorPropertyStatus,
  updateVendorProperty,
  updateVendorPropertyPhoto,
} from "@/lib/vendor-properties.functions";
import { uploadPropertyPhoto } from "@/components/vendor/propertyPhotos";
import { VendorModal, Field } from "@/components/vendor/VendorModal";
import {
  emptyPropertyForm,
  PropertyFormFields,
  propertyPayload,
  type PropertyFormState,
} from "@/components/vendor/PropertyForm";
import {
  EmptyState,
  ErrorBlock,
  formatDate,
  LoadingBlock,
  StatusBadge,
  titleCase,
} from "@/components/vendor/VendorUI";

export const Route = createFileRoute("/_authenticated/vendor/properties/$propertyId")({
  head: () => ({
    meta: [
      { title: "Property Details · Vendor · SmatraPay" },
      {
        name: "description",
        content: "Units, address, timeline, residents, owner and photos for this property.",
      },
      { property: "og:title", content: "Property Details · Vendor · SmatraPay" },
      {
        property: "og:description",
        content: "Full property record inside your assigned zones.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorPropertyDetails,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{error.message}</p>,
});

const TABS = [
  { id: "units", label: "Units", icon: Layers },
  { id: "address", label: "Address", icon: MapPin },
  { id: "timeline", label: "Unit Timeline", icon: History },
  { id: "residents", label: "Residents", icon: UsersIcon },
  { id: "owner", label: "Owner Details", icon: Building2 },
  { id: "photos", label: "My Photos", icon: Images },
] as const;

type TabId = (typeof TABS)[number]["id"];

const mapsKey = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"] as
  | string
  | undefined;

function VendorPropertyDetails() {
  const access = Route.useLoaderData();
  const { propertyId } = Route.useParams();
  const queryClient = useQueryClient();

  const fetchProperty = useServerFn(getVendorProperty);
  const fetchOptions = useServerFn(listVendorPropertyOptions);
  const updateFn = useServerFn(updateVendorProperty);
  const statusFn = useServerFn(setVendorPropertyStatus);
  const addPhotoFn = useServerFn(addVendorPropertyPhoto);
  const updatePhotoFn = useServerFn(updateVendorPropertyPhoto);
  const deletePhotoFn = useServerFn(deleteVendorPropertyPhoto);

  const { data, isLoading, error } = useQuery({
    queryKey: ["vendor-property", propertyId],
    queryFn: () => fetchProperty({ data: { id: propertyId } }),
  });
  const options = useQuery({
    queryKey: ["vendor-property-options"],
    queryFn: () => fetchOptions(),
  });

  const [tab, setTab] = useState<TabId>("units");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<PropertyFormState>(emptyPropertyForm);
  const [caption, setCaption] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const property = data?.property as any;
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["vendor-property", propertyId] });
    void queryClient.invalidateQueries({ queryKey: ["vendor-properties"] });
  };

  const openEdit = () => {
    if (!property) return;
    setForm({
      ...emptyPropertyForm,
      name: property.name ?? "",
      code: property.code ?? "",
      property_type: property.property_type ?? "building",
      building_category: property.building_category ?? "residential",
      subtype: property.subtype ?? "",
      description: property.description ?? "",
      owner_type: property.owner_type ?? "landlord",
      landlord_id: property.landlord_id ?? "",
      zone_id: property.zone_id != null ? String(property.zone_id) : "",
      number_of_units: property.number_of_units != null ? String(property.number_of_units) : "",
      status: property.status ?? "active",
      country: property.country ?? "",
      state: property.state ?? "",
      city: property.city ?? "",
      estate: property.estate ?? "",
      building_number: property.building_number ?? "",
      address_line1: property.address_line1 ?? "",
      address_line2: property.address_line2 ?? "",
      postal_code: property.postal_code ?? "",
      latitude: property.latitude != null ? String(property.latitude) : "",
      longitude: property.longitude != null ? String(property.longitude) : "",
    });
    setEditing(true);
  };

  const save = useMutation({
    mutationFn: async () => updateFn({ data: { id: propertyId, ...propertyPayload(form) } as never }),
    onSuccess: () => {
      toast.success("Property updated");
      setEditing(false);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleStatus = useMutation({
    mutationFn: async () =>
      statusFn({
        data: {
          id: propertyId,
          status: property?.status === "active" ? "archived" : "active",
        } as never,
      }),
    onSuccess: () => {
      toast.success("Status updated");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const path = await uploadPropertyPhoto(file, propertyId);
      return addPhotoFn({
        data: {
          property_id: propertyId,
          storage_path: path,
          ...(caption ? { caption } : {}),
          is_primary: (data?.photos.length ?? 0) === 0,
        } as never,
      });
    },
    onSuccess: () => {
      toast.success("Photo uploaded");
      setCaption("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setPrimary = useMutation({
    mutationFn: async (id: string) =>
      updatePhotoFn({ data: { id, property_id: propertyId, is_primary: true } as never }),
    onSuccess: () => {
      toast.success("Primary photo updated");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removePhoto = useMutation({
    mutationFn: async (id: string) =>
      deletePhotoFn({ data: { id, property_id: propertyId } as never }),
    onSuccess: () => {
      toast.success("Photo removed");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mapUrl = useMemo(() => {
    if (!property || !mapsKey) return null;
    if (property.latitude != null && property.longitude != null) {
      return `https://www.google.com/maps/embed/v1/view?key=${mapsKey}&center=${property.latitude},${property.longitude}&zoom=16`;
    }
    const q = [property.address_line1, property.estate, property.city, property.country]
      .filter(Boolean)
      .join(", ");
    if (!q) return null;
    return `https://www.google.com/maps/embed/v1/place?key=${mapsKey}&q=${encodeURIComponent(q)}`;
  }, [property]);

  if (isLoading) return <DashboardShell role={access.role} title="Property Details"><LoadingBlock /></DashboardShell>;
  if (error)
    return (
      <DashboardShell role={access.role} title="Property Details">
        <ErrorBlock message={(error as Error).message} />
      </DashboardShell>
    );
  if (!data || !property) return null;

  const owner = data.owner as any;

  return (
    <DashboardShell role={access.role} title="Property Details">
      <div className="space-y-5">
        <nav className="text-xs text-muted-foreground">
          <Link to="/vendor/dashboard" className="hover:underline">
            Vendor Portal
          </Link>{" "}
          ›{" "}
          <Link to="/vendor/properties" className="hover:underline">
            Property Management
          </Link>{" "}
          › <span className="text-foreground">{property.name}</span>
        </nav>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-start gap-4">
            {property.photo_url ? (
              <img
                src={property.photo_url}
                alt={`${property.name} photo`}
                className="h-20 w-20 rounded-xl object-cover"
              />
            ) : (
              <span className="flex h-20 w-20 items-center justify-center rounded-xl bg-muted">
                <Building2 className="h-7 w-7 text-muted-foreground" />
              </span>
            )}
            <div className="min-w-[240px] flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-black text-foreground">{property.name}</h1>
                <StatusBadge value={property.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                {property.code ?? property.id.slice(0, 8)} · {titleCase(property.property_type)} ·{" "}
                {property.zone_name ?? "No zone"}
              </p>
              <p className="text-sm text-muted-foreground">
                {[property.building_number, property.address_line1, property.estate, property.city]
                  .filter(Boolean)
                  .join(", ") || "No address recorded"}
              </p>
              <p className="mt-1 text-sm text-foreground">
                Owner: {owner?.name ?? owner?.email ?? "Not assigned"}{" "}
                <span className="text-muted-foreground">({titleCase(property.owner_type)})</span>
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                ["Units", property.unit_count],
                ["Occupied", property.occupied_units],
                ["Available", property.available_units],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border border-border px-4 py-2">
                  <p className="text-lg font-black text-foreground">{String(value)}</p>
                  <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                    {String(label)}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="rounded-lg border border-border px-3 py-2 text-sm" onClick={openEdit}>
              Edit property
            </button>
            <button
              className="rounded-lg border border-border px-3 py-2 text-sm"
              disabled={toggleStatus.isPending}
              onClick={() => toggleStatus.mutate()}
            >
              {property.status === "active" ? "Deactivate" : "Activate"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-border">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm ${
                tab === t.id
                  ? "border-primary font-bold text-foreground"
                  : "border-transparent text-muted-foreground"
              }`}
              onClick={() => setTab(t.id)}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          {tab === "units" &&
            (data.units.length === 0 ? (
              <EmptyState title="No units" message="This property has no units recorded yet." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Unit</th>
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-left">Floor</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Resident</th>
                      <th className="px-3 py-2 text-left">Owner</th>
                      <th className="px-3 py-2 text-left">Meters</th>
                      <th className="px-3 py-2 text-left">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.units.map((u) => (
                      <tr key={u.id} className="border-b border-border/60">
                        <td className="px-3 py-2 font-bold text-foreground">{u.unit_number}</td>
                        <td className="px-3 py-2">{u.unit_type ?? "—"}</td>
                        <td className="px-3 py-2">{u.floor ?? "—"}</td>
                        <td className="px-3 py-2">
                          <StatusBadge value={u.status} />
                        </td>
                        <td className="px-3 py-2">
                          {u.resident_id ? (
                            <Link
                              to="/vendor/residents/$residentId"
                              params={{ residentId: u.resident_id }}
                              className="hover:underline"
                            >
                              {u.resident_name ?? "View resident"}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2">{u.owner_name ?? "—"}</td>
                        <td className="px-3 py-2">
                          {u.meters.length === 0
                            ? "—"
                            : u.meters.map((m) => (
                                <Link
                                  key={m.id}
                                  to="/vendor/meters/$meterId"
                                  params={{ meterId: m.id }}
                                  className="mr-2 hover:underline"
                                >
                                  {m.meter_number}
                                </Link>
                              ))}
                        </td>
                        <td className="px-3 py-2">{formatDate(u.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

          {tab === "address" && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Property name" value={property.name} />
                <Field label="Country" value={property.country} />
                <Field label="County / Region" value={property.state} />
                <Field label="City / Town" value={property.city} />
                <Field label="Estate / Area" value={property.estate} />
                <Field label="Street" value={property.address_line1} />
                <Field label="Building / Plot number" value={property.building_number} />
                <Field label="Postal address" value={property.postal_code} />
                <Field label="Zone" value={property.zone_name} />
                <Field label="Latitude" value={property.latitude} />
                <Field label="Longitude" value={property.longitude} />
              </div>
              <div className="min-h-[260px] overflow-hidden rounded-xl border border-border">
                {mapUrl ? (
                  <iframe
                    title="Property location"
                    src={mapUrl}
                    className="h-full min-h-[260px] w-full"
                    loading="lazy"
                  />
                ) : (
                  <EmptyState
                    title="No map location"
                    message="Add coordinates or an address to show this property on the map."
                  />
                )}
              </div>
              <div>
                <button className="rounded-lg border border-border px-3 py-2 text-sm" onClick={openEdit}>
                  Edit address
                </button>
              </div>
            </div>
          )}

          {tab === "timeline" &&
            (data.timeline.length === 0 ? (
              <EmptyState title="No events yet" message="Property and unit changes will appear here." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Date &amp; time</th>
                      <th className="px-3 py-2 text-left">Event</th>
                      <th className="px-3 py-2 text-left">Unit</th>
                      <th className="px-3 py-2 text-left">Previous</th>
                      <th className="px-3 py-2 text-left">New</th>
                      <th className="px-3 py-2 text-left">Performed by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.timeline.map((e) => (
                      <tr key={e.id} className="border-b border-border/60 align-top">
                        <td className="px-3 py-2 whitespace-nowrap">
                          {new Date(e.created_at).toLocaleString()}
                        </td>
                        <td className="px-3 py-2">{titleCase(e.event.replace(/_/g, " "))}</td>
                        <td className="px-3 py-2">{e.unit ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{e.previous ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{e.next ?? "—"}</td>
                        <td className="px-3 py-2">{e.actor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

          {tab === "residents" &&
            (data.residents.length === 0 ? (
              <EmptyState
                title="No residents"
                message="Residents assigned to units in this property will appear here."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Resident</th>
                      <th className="px-3 py-2 text-left">Phone</th>
                      <th className="px-3 py-2 text-left">Email</th>
                      <th className="px-3 py-2 text-left">Unit</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Assigned</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.residents.map((r) => (
                      <tr key={r.assignment_id} className="border-b border-border/60">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {r.profile_image ? (
                              <img
                                src={r.profile_image}
                                alt={r.name ?? "Resident"}
                                className="h-8 w-8 rounded-full object-cover"
                              />
                            ) : (
                              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs">
                                {(r.name ?? "?").slice(0, 1)}
                              </span>
                            )}
                            <div>
                              <p className="font-bold text-foreground">{r.name ?? "Unnamed"}</p>
                              <p className="text-xs text-muted-foreground">RS-{r.id.slice(0, 8)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2">{r.phone ?? "—"}</td>
                        <td className="px-3 py-2">{r.email ?? "—"}</td>
                        <td className="px-3 py-2">{r.unit_number ?? "—"}</td>
                        <td className="px-3 py-2">
                          <StatusBadge value={r.current ? r.status : "past"} />
                        </td>
                        <td className="px-3 py-2">{formatDate(r.start_date)}</td>
                        <td className="px-3 py-2 text-right">
                          <Link
                            to="/vendor/residents/$residentId"
                            params={{ residentId: r.id }}
                            className="rounded-md border border-border px-2 py-1 text-xs"
                          >
                            View resident
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

          {tab === "owner" &&
            (!owner ? (
              <EmptyState
                title="No owner assigned"
                message="Assign a landlord, agent or vendor from Edit property."
              />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  {owner.profile_image ? (
                    <img
                      src={owner.profile_image}
                      alt={owner.name ?? "Owner"}
                      className="h-14 w-14 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                      <ClipboardList className="h-5 w-5 text-muted-foreground" />
                    </span>
                  )}
                  <div>
                    <p className="text-base font-bold text-foreground">{owner.name ?? "Unnamed"}</p>
                    <p className="text-xs text-muted-foreground">
                      {titleCase(owner.owner_type)} · LL-{String(owner.id).slice(0, 8)}
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Phone" value={owner.phone} />
                  <Field label="Email" value={owner.email} />
                  <Field label="Address" value={owner.address} />
                  <Field label="Zone" value={property.zone_name} />
                  <Field label="Properties" value={owner.property_count} />
                  <Field label="Assigned units" value={owner.unit_count} />
                  <Field label="Status" value={<StatusBadge value={owner.status} />} />
                </div>
                <div className="flex gap-2">
                  <Link
                    to="/vendor/landlords/$landlordId"
                    params={{ landlordId: owner.id }}
                    className="rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    View owner details
                  </Link>
                  <button className="rounded-lg border border-border px-3 py-2 text-sm" onClick={openEdit}>
                    Change owner
                  </button>
                </div>
              </div>
            ))}

          {tab === "photos" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Caption (optional)"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                />
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) upload.mutate(file);
                    e.target.value = "";
                  }}
                />
                <button
                  className="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground"
                  disabled={upload.isPending}
                  onClick={() => fileRef.current?.click()}
                >
                  {upload.isPending ? "Uploading…" : "Upload photo"}
                </button>
              </div>

              {data.photos.length === 0 ? (
                <EmptyState
                  title="No photos yet"
                  message="Upload exterior, interior, common-area or meter-room photos for this property."
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {data.photos.map((p) => (
                    <figure key={p.id} className="overflow-hidden rounded-xl border border-border">
                      {p.url ? (
                        <img
                          src={p.url}
                          alt={p.caption ?? `${property.name} photo`}
                          className="h-40 w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-40 items-center justify-center bg-muted text-xs text-muted-foreground">
                          Image unavailable
                        </div>
                      )}
                      <figcaption className="space-y-2 p-3 text-xs">
                        <p className="font-bold text-foreground">{p.caption ?? "Untitled"}</p>
                        <p className="text-muted-foreground">
                          {formatDate(p.created_at)} · {p.uploaded_by}
                          {p.is_primary ? " · Primary" : ""}
                        </p>
                        <div className="flex gap-2">
                          {!p.is_primary && (
                            <button
                              className="rounded-md border border-border px-2 py-1"
                              onClick={() => setPrimary.mutate(p.id)}
                            >
                              Set primary
                            </button>
                          )}
                          <button
                            className="rounded-md border border-destructive/40 px-2 py-1 text-destructive"
                            onClick={() => removePhoto.mutate(p.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {editing && (
        <VendorModal wide title="Edit property" onClose={() => setEditing(false)}>
          <PropertyFormFields
            form={form}
            onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
            owners={options.data?.owners ?? []}
            zones={options.data?.zones ?? []}
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              className="rounded-lg border border-border px-3 py-2 text-sm"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
            <button
              className="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </VendorModal>
      )}
    </DashboardShell>
  );
}
