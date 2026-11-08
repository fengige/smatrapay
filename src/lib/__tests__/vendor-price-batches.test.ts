import { describe, expect, it, vi } from "vitest";
import { submitVendorPriceBatches } from "../vendor-price-batches";

describe("vendor price request batching", () => {
  it("submits all 5000 selected meters without exceeding the 1000-ID server limit", async () => {
    const ids = Array.from({ length: 5000 }, (_, i) => `meter-${i}`);
    const submit = vi.fn(async (batch: string[]) => ({ submitted: batch.length, unchanged: 0, changes: [] }));
    const completed = vi.fn();
    const result = await submitVendorPriceBatches(ids, submit, completed);
    expect(result.submitted).toBe(5000);
    expect(submit.mock.calls.flatMap(([batch]) => batch)).toEqual(ids);
    expect(submit.mock.calls.every(([batch]) => batch.length <= 1000)).toBe(true);
    expect(completed).toHaveBeenCalledTimes(10);
  });

  it("keeps failed and unattempted meters pending without resubmitting completed batches", async () => {
    const ids = Array.from({ length: 1200 }, (_, i) => `meter-${i}`);
    const done: string[] = [];
    const submit = vi.fn(async (batch: string[]) => {
      if (batch[0] === "meter-500") throw new Error("Temporary failure");
      return { submitted: batch.length, unchanged: 0, changes: [] };
    });
    await expect(submitVendorPriceBatches(ids, submit, batch => done.push(...batch))).rejects.toThrow("Temporary failure");
    expect(done).toEqual(ids.slice(0, 500));
    expect(submit).toHaveBeenCalledTimes(2);
    const retry = vi.fn(async (batch: string[]) => ({ submitted: 0, unchanged: batch.length, changes: [] }));
    const result = await submitVendorPriceBatches(ids.filter(id => !done.includes(id)), retry, () => {});
    expect(result.unchanged).toBe(700);
    expect(retry.mock.calls.flatMap(([batch]) => batch)).toEqual(ids.slice(500));
  });

  it("deduplicates selected IDs and aggregates submitted and unchanged results", async () => {
    const result = await submitVendorPriceBatches(["a", "a", "b"], async batch => {
      expect(batch).toEqual(["a", "b"]);
      return { submitted: 1, unchanged: 1, changes: [{ id: "a", meter_number: "001", from: 10, to: 20 }] };
    }, () => {});
    expect(result).toEqual({ submitted: 1, unchanged: 1, changes: [{ id: "a", meter_number: "001", from: 10, to: 20 }] });
  });
});