import { z } from "zod";

export const tokenHistoryPageSchema = z.object({
  page: z.number().int().min(1).max(1_000_000).default(1),
  page_size: z.number().int().refine((n) => [10, 20, 50, 100].includes(n)).default(20),
});

export type TokenHistoryPage<T> = { rows: T[]; total: number; page: number; page_size: number };

export function tokenHistorySearch(search: Record<string, unknown>) {
  const rawPage = Number(search.page);
  const rawSize = Number(search.pageSize);
  return {
    page: Number.isInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 1_000_000) : 1,
    pageSize: [10, 20, 50, 100].includes(rawSize) ? rawSize : 20,
  };
}

export function tokenHistoryRange(page: number, size: number) {
  return { from: (page - 1) * size, to: page * size - 1 };
}