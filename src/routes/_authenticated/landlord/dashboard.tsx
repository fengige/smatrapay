import { createFileRoute } from "@tanstack/react-router";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";

export const Route = createFileRoute("/_authenticated/landlord/dashboard")({
  head: () => ({ meta: [{ title: "Landlord Dashboard · SmatraPay" }, { name: "description", content: "Your SmatraPay landlord dashboard." }, { property: "og:title", content: "Landlord Dashboard · SmatraPay" }, { property: "og:description", content: "Your SmatraPay landlord dashboard." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  loader: () => checkRoleAccess({ data: { role: "landlord" } }),
  component: LandlordDashboard,
  errorComponent: () => <p className="p-8 text-sm">Could not load this dashboard.</p>,
});

function LandlordDashboard() {
  return (
    <DashboardShell
      access={Route.useLoaderData()}
      title="Landlord dashboard"
      description="Track properties, residents, rent collection and payouts."
    />
  );
}
