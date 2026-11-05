import { createFileRoute } from '@tanstack/react-router';
import { LandlordPropertyDetailPage } from '@/components/LandlordPropertyDetailPage';
import { checkRoleAccess } from '@/lib/auth.functions';

export const Route = createFileRoute('/_authenticated/landlord/properties/$propertyId')({
  head: () => ({
    meta: [
      { title: 'Property Details · SmatraPay Landlord' },
      {
        name: 'description',
        content: 'View a linked property, its units and meters in SmatraPay.',
      },
      { property: 'og:title', content: 'Property Details · SmatraPay Landlord' },
      {
        property: 'og:description',
        content: 'View a linked property, its units and meters in SmatraPay.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  loader: async () => {
    const access = await checkRoleAccess({ data: { role: 'landlord' } });
    if (!access.allowed) throw new Error('Landlord access required');
    return access;
  },
  errorComponent: () => (
    <p role="alert" className="p-8">
      Landlord access is required to view this page.
    </p>
  ),
  component: function PropertyDetailRoute() {
    const { propertyId } = Route.useParams();
    return <LandlordPropertyDetailPage propertyId={propertyId} />;
  },
});
