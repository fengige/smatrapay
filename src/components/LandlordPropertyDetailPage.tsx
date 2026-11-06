import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Link } from '@tanstack/react-router';
import {
  Building2,
  ClipboardList,
  History,
  Images,
  Layers,
  MapPin,
  Users as UsersIcon,
} from 'lucide-react';
import { PortalLayout } from './PortalLayout';
import { Field } from './vendor/VendorModal';
import {
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  StatusBadge,
  formatDate,
  titleCase,
} from './vendor/VendorUI';
import { getLandlordPropertyDetail } from '@/lib/landlord-reporting.functions';
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh';

const TABS = [
  { id: 'units', label: 'Units', icon: Layers },
  { id: 'address', label: 'Address', icon: MapPin },
  { id: 'timeline', label: 'Unit Timeline', icon: History },
  { id: 'residents', label: 'Residents', icon: UsersIcon },
  { id: 'owner', label: 'Owner Details', icon: Building2 },
  { id: 'photos', label: 'Photos', icon: Images },
] as const;

type TabId = (typeof TABS)[number]['id'];

const mapsKey = import.meta.env['VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY'] as
  | string
  | undefined;

export function LandlordPropertyDetailPage({ propertyId }: { propertyId: string }) {
  const fn = useServerFn(getLandlordPropertyDetail);
  useRealtimeRefresh('landlord-property-detail', ['properties', 'units', 'meters', 'unit_assignments'], [['landlord-properties'], ['landlord-property', propertyId], ['bank-payments', 'landlord']]);
  const { data, isLoading, error } = useQuery({
    queryKey: ['landlord-property', propertyId],
    queryFn: () => fn({ data: { propertyId } }),
  });

  const [tab, setTab] = useState<TabId>('units');

  const property = data?.property as any;
  const owner = data?.owner as any;

  const mapUrl = useMemo(() => {
    if (!property || !mapsKey) return null;
    if (property.latitude != null && property.longitude != null) {
      return `https://www.google.com/maps/embed/v1/view?key=${mapsKey}&center=${property.latitude},${property.longitude}&zoom=16`;
    }
    const q = [property.address_line1, property.estate, property.city, property.country]
      .filter(Boolean)
      .join(', ');
    if (!q) return null;
    return `https://www.google.com/maps/embed/v1/place?key=${mapsKey}&q=${encodeURIComponent(q)}`;
  }, [property]);

  return (
    <PortalLayout
      roles={['landlord']}
      title="Property Details"
      description="Units, address, timeline, residents, owner and photos for this property."
    >
      {isLoading ? (
        <LoadingBlock />
      ) : error || !data || !property ? (
        <ErrorBlock message={(error as Error)?.message ?? 'Could not load this property.'} />
      ) : (
        <div className="space-y-5">
          <nav className="text-xs text-muted-foreground">
            <Link to="/landlord/dashboard" className="hover:underline">
              Landlord Portal
            </Link>{' '}
            ›{' '}
            <Link to="/landlord/properties" className="hover:underline">
              My Properties
            </Link>{' '}
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
                  <p className="text-xl font-black text-foreground">{property.name}</p>
                  <StatusBadge value={property.status} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {property.code ?? property.id.slice(0, 8)} · {titleCase(property.property_type)} ·{' '}
                  {property.zone_name ?? 'No zone'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {[property.building_number, property.address_line1, property.estate, property.city]
                    .filter(Boolean)
                    .join(', ') || 'No address recorded'}
                </p>
                <p className="mt-1 text-sm text-foreground">
                  Managing vendor:{' '}
                  <span className="text-muted-foreground">{property.vendor_name ?? 'Not available'}</span>
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  ['Units', property.unit_count],
                  ['Occupied', property.occupied_units],
                  ['Available', property.available_units],
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
          </div>

          <div className="flex flex-wrap gap-2 border-b border-border">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm ${
                  tab === t.id
                    ? 'border-primary font-bold text-foreground'
                    : 'border-transparent text-muted-foreground'
                }`}
                onClick={() => setTab(t.id)}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            {tab === 'units' &&
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
                          <td className="px-3 py-2">{u.unit_type ?? '—'}</td>
                          <td className="px-3 py-2">{u.floor ?? '—'}</td>
                          <td className="px-3 py-2">
                            <StatusBadge value={u.status} />
                          </td>
                          <td className="px-3 py-2">{u.resident_name ?? '—'}</td>
                          <td className="px-3 py-2">{u.owner_name ?? '—'}</td>
                          <td className="px-3 py-2">
                            {u.meters.length === 0
                              ? '—'
                              : u.meters.map((m) => (
                                  <span key={m.id} className="mr-2 inline-block">
                                    {m.meter_number}
                                    <span className="block text-xs text-muted-foreground">
                                      {titleCase(m.type)} · {titleCase(m.status)}
                                    </span>
                                  </span>
                                ))}
                          </td>
                          <td className="px-3 py-2">{formatDate(u.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

            {tab === 'address' && (
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
                      message="This property has no coordinates or address to show on the map."
                    />
                  )}
                </div>
              </div>
            )}

            {tab === 'timeline' &&
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
                          <td className="px-3 py-2">{titleCase(e.event.replace(/_/g, ' '))}</td>
                          <td className="px-3 py-2">{e.unit ?? '—'}</td>
                          <td className="px-3 py-2 text-muted-foreground">{e.previous ?? '—'}</td>
                          <td className="px-3 py-2 text-muted-foreground">{e.next ?? '—'}</td>
                          <td className="px-3 py-2">{e.actor}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

            {tab === 'residents' &&
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
                      </tr>
                    </thead>
                    <tbody>
                      {data.residents.map((r) => (
                        <tr key={r.assignment_id} className="border-b border-border/60">
                          <td className="px-3 py-2">
                            <p className="font-bold text-foreground">{r.name ?? 'Unnamed'}</p>
                            <p className="text-xs text-muted-foreground">RS-{r.id.slice(0, 8)}</p>
                          </td>
                          <td className="px-3 py-2">{r.phone ?? '—'}</td>
                          <td className="px-3 py-2">{r.email ?? '—'}</td>
                          <td className="px-3 py-2">{r.unit_number ?? '—'}</td>
                          <td className="px-3 py-2">
                            <StatusBadge value={r.current ? r.status : 'past'} />
                          </td>
                          <td className="px-3 py-2">{formatDate(r.start_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

            {tab === 'owner' &&
              (!owner ? (
                <EmptyState
                  title="No owner assigned"
                  message="This property has no owner recorded."
                />
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                      <ClipboardList className="h-5 w-5 text-muted-foreground" />
                    </span>
                    <div>
                      <p className="text-base font-bold text-foreground">{owner.name ?? 'Unnamed'}</p>
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
                </div>
              ))}

            {tab === 'photos' &&
              (data.photos.length === 0 ? (
                <EmptyState
                  title="No photos yet"
                  message="Photos uploaded for this property will appear here."
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
                      <figcaption className="space-y-1 p-3 text-xs">
                        <p className="font-bold text-foreground">{p.caption ?? 'Untitled'}</p>
                        <p className="text-muted-foreground">
                          {formatDate(p.created_at)} · {p.uploaded_by}
                          {p.is_primary ? ' · Primary' : ''}
                        </p>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ))}
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
