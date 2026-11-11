import { describe, expect, it } from "vitest";
import { assertCommissionTarget, changeCommissionTarget, ownerCommissionInput, type CommissionOwnerType } from "../owner-commission";

const owner = "11111111-1111-4111-8111-111111111111";
const property = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const valid = { owner_type: "landlord" as const, owner_id: owner, property_scope: "all" as const, property_id: null, commission_payer: "owner" as const, commission_percentage: 5, vat_on_commission_percentage: 16 };
const owners = [{ id: owner, name: "Selected owner" }];
const properties = [{ id: property, name: "Linked property" }];

describe("required commission target controls", () => {
  it.each<CommissionOwnerType>(["landlord", "vendor", "agent"])("persists the %s owner type and all-properties scope", owner_type => {
    expect(ownerCommissionInput.parse({ ...valid, owner_type })).toEqual({ ...valid, owner_type });
  });
  it("requires an owner type", () => {
    expect(ownerCommissionInput.safeParse({ ...valid, owner_type: undefined }).success).toBe(false);
  });
  it("requires a matching owner account", () => {
    expect(ownerCommissionInput.safeParse({ ...valid, owner_id: "" }).success).toBe(false);
    expect(() => assertCommissionTarget(valid, [{ id: other, name: "Other type" }], properties)).toThrow("matching the owner type");
  });
  it("requires a property scope", () => {
    expect(ownerCommissionInput.safeParse({ ...valid, property_scope: undefined }).success).toBe(false);
  });
  it("requires a property for Specific Property", () => {
    expect(ownerCommissionInput.safeParse({ ...valid, property_scope: "specific" }).success).toBe(false);
  });
  it("persists the selected property together with payer and rates", () => {
    const input = ownerCommissionInput.parse({ ...valid, property_scope: "specific", property_id: property });
    expect(input).toMatchObject({ property_scope: "specific", property_id: property, commission_payer: "owner", commission_percentage: 5, vat_on_commission_percentage: 16 });
    expect(() => assertCommissionTarget(input, owners, properties)).not.toThrow();
  });
  it("rejects another owner's property", () => {
    expect(() => assertCommissionTarget({ ...valid, property_scope: "specific", property_id: other }, owners, properties)).toThrow("linked to this owner");
  });
  it("blocks an all-properties save for an owner without linked properties", () => {
    expect(() => assertCommissionTarget(valid, owners, [])).toThrow("no linked properties");
  });
  it("rejects a specific property under All Properties rather than broadening the target", () => {
    expect(ownerCommissionInput.safeParse({ ...valid, property_id: property }).success).toBe(false);
  });
  const selected = { owner_type: "landlord" as const, owner_id: owner, property_scope: "specific" as const, property_id: property };
  it("clears the owner and property when the owner type changes", () => {
    expect(changeCommissionTarget(selected, { owner_type: "vendor" })).toEqual({ owner_type: "vendor", owner_id: "", property_scope: "", property_id: "" });
  });
  it("clears the property when the owner changes", () => {
    expect(changeCommissionTarget(selected, { owner_id: other })).toEqual({ owner_type: "landlord", owner_id: other, property_scope: "", property_id: "" });
  });
  it("clears a specific property when the scope changes", () => {
    expect(changeCommissionTarget(selected, { property_scope: "all" })).toEqual({ ...selected, property_scope: "all", property_id: "" });
  });
});