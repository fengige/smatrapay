import { describe, expect, it } from "vitest";
import { residentOwnsJob } from "../jobs-access";

describe("customer job isolation", () => {
  it("allows the linked resident's own job", () => {
    expect(residentOwnsJob("resident-a", { resident_id: "resident-a" })).toBe(true);
  });
  it("rejects another resident's job", () => {
    expect(residentOwnsJob("resident-a", { resident_id: "resident-b" })).toBe(false);
  });
  it("rejects missing and unlinked jobs", () => {
    expect(residentOwnsJob("resident-a", null)).toBe(false);
    expect(residentOwnsJob("resident-a", { resident_id: null })).toBe(false);
  });
});