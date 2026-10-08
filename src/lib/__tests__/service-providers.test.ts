import { describe, expect, it } from "vitest";
import { canReceiveJobs, providerActions, servicesListSchema } from "@/lib/service-provider-schema";

describe("service provider rules", () => {
  it("active providers can be suspended, not unsuspended", () => {
    expect(providerActions("active")).toEqual(["view", "edit", "suspend", "delete"]);
  });
  it("suspended providers can be unsuspended, not suspended", () => {
    expect(providerActions("suspended")).toEqual(["view", "edit", "unsuspend", "delete"]);
  });
  it("only active providers can receive new jobs", () => {
    expect(canReceiveJobs("active")).toBe(true);
    expect(canReceiveJobs("suspended")).toBe(false);
    expect(canReceiveJobs("inactive")).toBe(false);
  });
  it("requires at least one service", () => {
    expect(servicesListSchema.safeParse([]).success).toBe(false);
  });
  it("requires name and description for each service", () => {
    expect(
      servicesListSchema.safeParse([{ service_name: "Plumbing", description: "" }]).success,
    ).toBe(false);
  });
  it("rejects duplicate service names ignoring case and spacing", () => {
    const r = servicesListSchema.safeParse([
      { service_name: "Plumbing", description: "Pipes" },
      { service_name: "  plumbing ", description: "Taps" },
    ]);
    expect(r.success).toBe(false);
  });
});
