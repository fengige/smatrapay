import { RESIDENT_DASHBOARD } from "@/lib/portals";

export const RESIDENT_RETURN_KEY = "sp_resident_return";

/** Only same-origin Resident Portal paths are accepted as a return destination. */
export function safeResidentReturn(path: string | null | undefined): string {
  if (!path || typeof path !== "string") return RESIDENT_DASHBOARD;
  if (!path.startsWith("/resident/") || path.startsWith("//") || path.includes("\\")) {
    return RESIDENT_DASHBOARD;
  }
  if (/[\s:]/.test(path.split("?")[0])) return RESIDENT_DASHBOARD;
  return path;
}

export type ResidentAccess = {
  roles: string[];
  profile: { status?: string | null } | null;
};

export type ResidentDecision =
  | { ok: true }
  | { ok: false; reason: "no_profile" | "inactive" | "not_resident" | "staff"; message: string };

/**
 * Decide whether a signed-in account may enter the Resident Portal.
 * Staff accounts are left to the Staff sign-in flow, so their behaviour is unchanged.
 */
export function residentDecision(access: ResidentAccess): ResidentDecision {
  if (!access.profile) {
    return {
      ok: false,
      reason: "no_profile",
      message: "This Google account is not linked to a SmatraPay resident profile. Please contact your property manager.",
    };
  }
  const status = access.profile.status ?? "active";
  if (status === "suspended" || status === "inactive") {
    return { ok: false, reason: "inactive", message: "Your account is not active. Please contact support." };
  }
  const staff = access.roles.filter((r) => r !== "resident" && r !== "user");
  if (staff.length) {
    return {
      ok: false,
      reason: "staff",
      message: "This is a staff account. Please use the Staff tab to sign in.",
    };
  }
  if (!access.roles.includes("resident")) {
    return {
      ok: false,
      reason: "not_resident",
      message: "This account does not have access to the Resident Portal.",
    };
  }
  return { ok: true };
}

/** Readable message for an OAuth error returned in the callback URL. */
export function oauthErrorMessage(error: string | null, description: string | null): string | null {
  if (!error) return null;
  if (error === "access_denied" || /cancel/i.test(description ?? "")) {
    return "Google sign-in was cancelled. You can try again.";
  }
  return "Google sign-in failed. Please try again.";
}
