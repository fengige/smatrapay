import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { PortalLayout } from './PortalLayout';
import { Button } from './ui/button';
import { getLandlordPropertyDetail } from '@/lib/landlord-reporting.functions';

const METER_TYPES = ['Electricity', 'Water', 'Gas'] as const;

export function LandlordPropertyDetailPage({ propertyId }: { propertyId: string }) {
  const fn = useServerFn(getLandlordPropertyDetail);
  const query = useQuery({
    queryKey: ['landlord-property', propertyId],
    queryFn: () => fn({ data: { propertyId } }),
  });

  const property = query.data?.property;
  const units = query.data?.units ?? [];
  const meters = query.data?.meters ?? [];

  const unitMeters = (unitId: string, meterNos: (string | null)[]) =>
    meters.filter((m) => m.unit_id === unitId || (!m.unit_id && meterNos.includes(m.meter_number)));

  const linkedUnitIds = new Set(units.map((u) => u.id));
  const unlinkedMeters = meters.filter((m) => !m.unit_id || !linkedUnitIds.has(m.unit_id));

  return (
    <PortalLayout
      roles={['landlord']}
      title={property?.name ?? 'Property Details'}
      actions={
        <Button asChild variant="outline">
          <Link to="/landlord/properties">
            <ArrowLeft className="mr-1 size-4" /> All properties
          </Link>
        </Button>
      }
    >
      {query.isLoading ? (
        <Loader2 aria-label="Loading property" className="mx-auto animate-spin" />
      ) : query.isError || !property ? (
        <p className="text-destructive">Could not load this property.</p>
      ) : (
        <div className="space-y-6">
          <section className="rounded-xl border border-border p-4">
            <h2 className="text-lg font-semibold">{property.name}</h2>
            <p className="text-sm text-muted-foreground">
              {property.code ?? '—'} ·{' '}
              {[property.address_line1, property.city].filter(Boolean).join(', ') || '—'}
              {property.vendor_name ? ` · Managing vendor: ${property.vendor_name}` : ''}
            </p>
          </section>

          <section>
            <h3 className="mb-3 text-base font-semibold">Units</h3>
            {units.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">No assigned units.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-secondary text-left">
                    <tr>
                      {['Unit Name', 'Status', 'Electricity', 'Water', 'Gas', 'Managing Vendor'].map(
                        (x) => (
                          <th className="p-3" key={x}>
                            {x}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {units.map((u) => {
                      const um = unitMeters(u.id, [
                        u.electricity_meter_no,
                        u.water_meter_no,
                        u.gas_meter_no,
                      ]);
                      return (
                        <tr key={u.id} className="border-b border-border">
                          <td className="p-3">
                            {u.unit_number}
                            {u.building && (
                              <span className="block text-muted-foreground">{u.building}</span>
                            )}
                          </td>
                          <td className="p-3">{u.status}</td>
                          {METER_TYPES.map((type) => (
                            <td className="p-3" key={type}>
                              {um
                                .filter((m) => m.type === type)
                                .map((m) => (
                                  <div key={m.id}>
                                    {m.meter_number}
                                    <span className="block text-xs text-muted-foreground">
                                      {m.status}
                                      {m.vendor_name ? ` · ${m.vendor_name}` : ''}
                                    </span>
                                  </div>
                                ))}
                              {!um.some((m) => m.type === type) && '—'}
                            </td>
                          ))}
                          <td className="p-3">
                            {[...new Set(um.map((m) => m.vendor_name).filter(Boolean))].join(', ') ||
                              property.vendor_name ||
                              '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {unlinkedMeters.length > 0 && (
            <section>
              <h3 className="mb-2 text-base font-semibold">Meters awaiting unit linkage</h3>
              {unlinkedMeters.map((m) => (
                <p className="py-1 text-sm" key={m.id}>
                  {m.meter_number} · {m.type} · {m.vendor_name ?? 'Vendor unavailable'}
                </p>
              ))}
            </section>
          )}
        </div>
      )}
    </PortalLayout>
  );
}
