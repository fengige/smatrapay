type Profile = {
  id: string;
  status: string;
  created_at: string;
};

/** Filter the full vendor population before selecting the newest accounts. */
export function summarizeVendors<T extends Profile>(profiles: T[], roles: { user_id: string; role: string }[]) {
  const vendorIds = new Set(roles.filter((row) => row.role === "vendor").map((row) => row.user_id));
  const vendors = profiles.filter((profile) => vendorIds.has(profile.id));
  return {
    total: vendors.length,
    active: vendors.filter((vendor) => vendor.status === "active").length,
    recent: [...vendors].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5),
  };
}