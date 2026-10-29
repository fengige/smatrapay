import { createFileRoute } from "@tanstack/react-router";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { residentHead } from "@/components/resident/ResidentUI";
import { ResidentPaygApplicationDetails } from "@/components/payg/ResidentPaygApplicationDetails";

export const Route = createFileRoute("/_authenticated/resident/payg-applications")({
  head: residentHead("My Pay-as-you-go applications", "Your Pay-as-you-go application status, payment schedules and confirmed instalment progress."),
  loader: () => checkRoleAccess({ data: { role: "resident" } }),
  component: Page,
  errorComponent: () => <p role="alert" className="p-8">Could not load your applications. Please try again.</p>,
});

function Page() {
  return <DashboardShell access={Route.useLoaderData()} title="My Pay-as-you-go applications" description="Your applications, payment schedules and instalment progress."><ResidentPaygApplicationDetails /></DashboardShell>;
}