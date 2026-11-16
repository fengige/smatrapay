export type ResidentGoogleStatus = "allowed" | "unregistered" | "duplicate" | "inactive" | "link_required" | "unverified";

export function residentGoogleError(status: string): string | null {
  if (status === "allowed") return null;
  if (status === "unregistered") return "This Google account email is not registered as a resident. Please contact management or use your registered email address.";
  if (status === "inactive") return "Resident access is unavailable for this account. Please contact management.";
  if (status === "duplicate" || status === "link_required") return "We couldn't safely match this Google account to a resident. Please contact management or use your username and password.";
  return "Google did not provide a verified registered email. Please try again or use your username and password.";
}

/** Only use identity and AMR obtained from provider-verified sessions. */
export function isGoogleSession(user: { identities?: Array<{ provider: string }> }, claims: { amr?: unknown }): boolean {
  return Boolean(user.identities?.some(i => i.provider === "google") && Array.isArray(claims.amr) && claims.amr.some(a => a && typeof a === "object" && "method" in a && a.method === "oauth"));
}