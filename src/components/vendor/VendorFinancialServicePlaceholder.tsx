import type { LucideIcon } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";

type Access = Parameters<typeof DashboardShell>[0]["access"];

export function VendorFinancialServicePlaceholder({
  access,
  title,
  description,
  icon: Icon,
}: {
  access: Access;
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <DashboardShell access={access} title={title} description={description}>
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">{title} is coming soon</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          This service is not available for vendor accounts yet. No products, applications or approvals are offered here.
        </p>
      </div>
    </DashboardShell>
  );
}
