import { createFileRoute, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { LandlordDashboardSummary } from "@/components/LandlordDashboardSummary";
import { Button } from "@/components/ui/button";
import { getLandlordDashboard } from "@/lib/landlord-dashboard.functions";
import { landlordDashboardKey } from "@/lib/landlord-dashboard";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";

const dashboardQuery = queryOptions({
  queryKey: landlordDashboardKey,
  queryFn: () => getLandlordDashboard(),
  staleTime: 0,
  refetchInterval: 30_000,
  refetchOnWindowFocus: true,
});

export const Route = createFileRoute("/_authenticated/landlord/dashboard")({
  head: () => ({ meta: [{ title: "Landlord Dashboard · SmatraPay" }, { name: "description", content: "Confirmed property payment collections and recent token transactions across your linked SmatraPay properties." }, { property: "og:title", content: "Landlord Dashboard · SmatraPay" }, { property: "og:description", content: "Daily, weekly, monthly and annual landlord collections with your latest five token transactions." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  loader: async ({ context }) => {
    const access = await checkRoleAccess({ data: { role: "landlord" } });
    if (access.allowed) await context.queryClient.ensureQueryData(dashboardQuery);
    return access;
  },
  component: LandlordDashboard,
  pendingComponent: () => <div role="status" className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><RefreshCw className="size-4 motion-safe:animate-spin" />Loading landlord collections…</div>,
  errorComponent: LandlordDashboardError,
});

function LandlordDashboardError() {
  const router = useRouter();
  return <div role="alert" className="p-8 text-sm"><p className="mb-3 text-destructive">Could not load the landlord dashboard. No collection totals are available.</p><Button variant="outline" onClick={() => void router.invalidate()}>Try again</Button></div>;
}

function LandlordDashboardContent() {
  const result = useSuspenseQuery(dashboardQuery);
  useRealtimeRefresh('landlord-dashboard', ['bank_notifications', 'meters', 'properties', 'units', 'unit_assignments', 'property_landlords'], [landlordDashboardKey, ['landlord-report']]);
  return <LandlordDashboardSummary data={result.data} refreshing={result.isFetching} onRefresh={() => void result.refetch()} refreshError={result.isRefetchError} />;
}

function LandlordDashboard() {
  const access = Route.useLoaderData();
  return (
    <DashboardShell
      access={access}
      title="Landlord dashboard"
      description="Track properties, residents, rent collection and payouts."
    >
      {access.allowed && <LandlordDashboardContent />}
    </DashboardShell>
  );
}
