/**
 * Resident Management lists show only accounts whose roles are exclusively
 * "resident". Accounts that also hold staff roles (landlord, vendor, admin,
 * agent, service_provider, moderator, user) belong to their staff portals and
 * must not appear as residents.
 */
export function residentOnlyIds(ids: string[], extraRoleUserIds: Iterable<string>): string[] {
  const excluded = new Set(extraRoleUserIds);
  return ids.filter((id) => !excluded.has(id));
}
