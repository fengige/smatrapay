import type { VendingIntegration } from "./types";
import { calinVendingService } from "./calin.server";

/**
 * Vending software integration registry.
 * Add future platforms here — the token workflow itself never changes.
 */
const INTEGRATIONS: VendingIntegration[] = [calinVendingService];

export function getVendingIntegration(softwareCode: string | null): VendingIntegration | null {
  if (!softwareCode) return null;
  const code = softwareCode.trim().toUpperCase();
  // Accept variants such as "CALIN-1" or "CALIN V2" for the same platform.
  return (
    INTEGRATIONS.find(
      (i) => code === i.code || code.startsWith(`${i.code}-`) || code.startsWith(`${i.code} `) || code.startsWith(`${i.code}_`),
    ) ?? null
  );
}
