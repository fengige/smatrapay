import { describe, expect, it } from "vitest";
import { PROVIDER_TRANSITIONS } from "@/lib/jobs.functions";

describe("provider job status moves", () => {
  it("assigned jobs can start or be cancelled", () => {
    expect(PROVIDER_TRANSITIONS["assigned"]).toEqual(["in_progress", "cancelled"]);
  });
  it("only in-progress jobs can be completed", () => {
    expect(PROVIDER_TRANSITIONS["in_progress"]).toContain("resolved");
    expect(PROVIDER_TRANSITIONS["assigned"]).not.toContain("resolved");
  });
  it("finished jobs cannot change", () => {
    for (const s of ["resolved", "closed", "cancelled"]) expect(PROVIDER_TRANSITIONS[s]).toBeUndefined();
  });
});
