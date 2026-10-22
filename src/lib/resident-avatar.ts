/** Never interpret a foreign object path as this resident's avatar. */
export function residentAvatarSource(value: string | null | undefined, id: string) {
  if (!value) return null;
  if (/^https:\/\//i.test(value)) {
    try { const url = new URL(value); return url.username || url.password ? null : { url: value }; } catch { return null; }
  }
  if (!id || value.includes("..") || !new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/(?:profile/)?[a-zA-Z0-9_-]+\\.(jpg|png|webp)$`).test(value)) return null;
  return { path: value };
}