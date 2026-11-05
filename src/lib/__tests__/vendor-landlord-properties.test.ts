import { describe, expect, it } from "vitest";

import { partitionAssignableProperties } from "@/lib/vendor-landlords.functions";

const props = [
  { id: "p1", name: "Sunrise Apartments", landlord_id: null },
  { id: "p2", name: "Riverview Court", landlord_id: null },
  { id: "p3", name: "Hilltop Villas", landlord_id: "landlord-x" },
];

describe("partitionAssignableProperties", () => {
  it("allows assigning more than one unowned property to a landlord", () => {
    const { assignable, missing, taken } = partitionAssignableProperties(["p1", "p2"], props);
    expect(assignable).toEqual(["p1", "p2"]);
    expect(missing).toEqual([]);
    expect(taken).toEqual([]);
  });

  it("rejects properties already owned by another landlord", () => {
    const { assignable, taken } = partitionAssignableProperties(["p1", "p3"], props);
    expect(assignable).toEqual(["p1"]);
    expect(taken.map((p) => p.name)).toEqual(["Hilltop Villas"]);
  });

  it("flags properties outside the caller's scope as missing", () => {
    const { missing } = partitionAssignableProperties(["p1", "p9"], props);
    expect(missing).toEqual(["p9"]);
  });

  it("deduplicates repeated property ids", () => {
    const { assignable } = partitionAssignableProperties(["p1", "p1", "p2"], props);
    expect(assignable).toEqual(["p1", "p2"]);
  });

  it("assigns nothing when no properties are requested", () => {
    const { assignable, missing, taken } = partitionAssignableProperties([], props);
    expect(assignable).toEqual([]);
    expect(missing).toEqual([]);
    expect(taken).toEqual([]);
  });
});
