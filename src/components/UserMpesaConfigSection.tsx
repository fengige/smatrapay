import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Loader2, Smartphone } from "lucide-react";

import { listPaymentMethods, type PaymentMethodRow } from "@/lib/payment-methods.functions";
import { MpesaConfigPanel } from "@/components/MpesaConfigPanel";

function isMpesa(m: PaymentMethodRow) {
  return /mpesa|m-pesa|daraja/i.test(`${m.code} ${m.name}`);
}

/**
 * Per-user M-Pesa (Daraja) gateway settings shown on the landlord / agent /
 * vendor detail pages so each user can hold their own credentials.
 */
export function UserMpesaConfigSection({
  ownerId,
  ownerName,
}: {
  ownerId: string;
  ownerName: string;
}) {
  const fetchMethods = useServerFn(listPaymentMethods);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["payment-methods"],
    queryFn: () => fetchMethods(),
  });

  const methods = ((data?.methods ?? []) as PaymentMethodRow[]).filter(isMpesa);

  if (isLoading) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <Loader2 className="mx-auto size-5 animate-spin" />
      </div>
    );
  }

  if (!methods.length) return null;

  return (
    <div className="space-y-3 border-t border-border px-6 py-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground">M-Pesa Gateway Settings</h3>
        <p className="text-xs text-muted-foreground">
          Daraja credentials, callback URLs, connection test and sandbox STK Push tester for{" "}
          {ownerName}. These are stored separately from the platform-wide configuration.
        </p>
      </div>

      {methods.map((m) => {
        const open = openId === m.id;
        return (
          <div key={m.id} className="rounded-xl border border-border bg-card">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : m.id)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Smartphone className="size-4 text-primary" />
                {m.name}
              </span>
              <ChevronDown
                className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
              />
            </button>
            {open && (
              <div className="border-t border-border p-4">
                <MpesaConfigPanel paymentMethodId={m.id} ownerId={ownerId} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
