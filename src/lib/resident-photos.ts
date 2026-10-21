import { z } from "zod";

export const residentPhotoPaths = z.array(z.string().max(250)).max(5).default([]);
export function ownsResidentPhoto(path: string, userId: string) {
  return new RegExp(`^${userId}/resident-requests/[0-9a-f-]{36}/[0-9a-f-]{36}\\.(jpg|png|webp)$`).test(path);
}