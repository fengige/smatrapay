import { describe, expect, it } from "vitest";
import { listInput } from "@/lib/jobs.functions";

describe("resident jobs filter", () => {
  it("accepts a resident uuid for staff job lists", () => {
    const parsed = listInput.parse({ resident: "0f3d2c1a-0000-4000-8000-abcdefabcdef" });
    expect(parsed.resident).toBe("0f3d2c1a-0000-4000-8000-abcdefabcdef");
  });
  it("rejects a non-uuid resident value", () => {
    expect(() => listInput.parse({ resident: "RES-123" })).toThrow();
  });
  it("defaults to page 1 with a bounded page size", () => {
    const parsed = listInput.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
  });
});
