import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Link } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { PortalLayout } from './PortalLayout';
import { Button } from './ui/button';
import { getLandlordProperties } from '@/lib/landlord-reporting.functions';

export function LandlordPropertiesPage() {
  const fn = useServerFn(getLandlordProperties);
  const query = useQuery({ queryKey: ['landlord-properties'], queryFn: () => fn() });
  const properties = query.data?.properties ?? [];
  const units = query.data?.units ?? [];
  const meters = query.data?.meters ?? [];

  return (
    <PortalLayout
      roles={['landlord']}
      title="My Properties"
      actions={
        <Button variant="outline" onClick={() => void query.refetch()}>
          Refresh
        </Button>
      }
    >
      {query.isLoading ? (
        <Loader2 aria-label="Loading properties" className="mx-auto animate-spin" />
      ) : query.isError ? (
        <p className="text-destructive">Could not load your properties.</p>
      ) : !properties.length ? (
        <p className="text-muted-foreground">No properties are linked to your account.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left">
              <tr>
                {['Property', 'Code', 'Location', 'Units', 'Meters', 'Managing Vendor', ''].map(
                  (x) => (
                    <th className="p-3" key={x}>
                      {x}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => (
                <tr key={p.id} className="border-b border-border">
                  <td className="p-3 font-medium">{p.name}</td>
                  <td className="p-3">{p.code ?? '—'}</td>
                  <td className="p-3">
                    {[p.address_line1, p.city].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="p-3">{units.filter((u) => u.property_id === p.id).length}</td>
                  <td className="p-3">{meters.filter((m) => m.property_id === p.id).length}</td>
                  <td className="p-3">{p.vendor_name ?? '—'}</td>
                  <td className="p-3 text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link to="/landlord/properties/$propertyId" params={{ propertyId: p.id }}>
                        View details
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PortalLayout>
  );
}
