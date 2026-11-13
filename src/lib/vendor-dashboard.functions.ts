import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/** Confirmed collections across every meter assigned to the signed-in vendor. */
export const getVendorCollections = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertVendor, loadVendorScope } = await import('./vendor.server');
    const { readCollectionDashboard } = await import('./landlord-dashboard.server');
    const vendorId = await assertVendor(context as any);
    const scope = await loadVendorScope(context.supabase as any, vendorId);
    const meters = scope.meters.map(m => ({
      id: m.id, meter_number: m.meter_number, type: m.type, property_id: m.property_id,
      property_name: m.property_name ?? '—', unit_name: m.unit_label ?? '—',
    }));
    const properties = new Set(meters.flatMap(m => m.property_id ? [m.property_id] : [])).size;
    return readCollectionDashboard(context.supabase, meters, properties);
  });
