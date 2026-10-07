import type { VendingIntegration } from "./types";
import { calinVendingService } from "./calin.server";
import { iconVendingService } from "./icon.server";

/**
 * Vending software integration registry.
 * Add future platforms here — the token workflow itself never changes.
 */
const INTEGRATIONS: VendingIntegration[] = [calinVendingService, iconVendingService];

export function getVendingIntegration(softwareCode: string | null): VendingIntegration | null {
  if (!softwareCode) return null;
  let code = softwareCode.trim().toUpperCase();
  if (code === "ICON-TOKEN" || code === "ICONTOKEN") code = "ICON";
  // Accept variants such as "CALIN-1" or "CALIN V2" for the same platform.
  return (
    INTEGRATIONS.find(
      (i) => code === i.code || code.startsWith(`${i.code}-`) || code.startsWith(`${i.code} `) || code.startsWith(`${i.code}_`),
    ) ?? null
  );
}
