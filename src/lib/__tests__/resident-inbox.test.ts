import { describe, expect, it } from "vitest";
import { canTransitionEnquiry, enquiryDecision, enquiryReply, enquiryStatusLabel, inboxFilters, mayReadResidentInbox } from "../resident-inbox";
import { ownsResidentPhoto, residentPhotoPaths } from "../resident-photos";

const user = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const path = `${user}/resident-requests/${other}/${other}.jpg`;
describe("resident photo isolation", () => {
  it("rejects another resident's attachment", () => {
    expect(ownsResidentPhoto(path, user)).toBe(true);
    expect(ownsResidentPhoto(path, other)).toBe(false);
  });
  it("rejects traversal and external URLs", () => {
    expect(ownsResidentPhoto(`${user}/resident-requests/../secret.jpg`, user)).toBe(false);
    expect(ownsResidentPhoto(`https://example.com/${path}`, user)).toBe(false);
  });
  it("bounds attachments", () => {
    expect(residentPhotoPaths.safeParse(Array(6).fill(path)).success).toBe(false);
    expect(residentPhotoPaths.safeParse(Array(5).fill(path)).success).toBe(true);
  });
});
describe("resident inbox permissions and validation", () => {
  it("permits only admins", () => {
    expect(mayReadResidentInbox(["admin"])).toBe(true);
    for (const role of ["vendor", "resident", "service_provider", "landlord", "agent"]) expect(mayReadResidentInbox([role])).toBe(false);
  });
  it("rejects empty replies and invalid ids", () => {
    expect(enquiryReply.safeParse({ id: user, response: "   " }).success).toBe(false);
    expect(enquiryReply.safeParse({ id: "not-an-id", response: "Reply" }).success).toBe(false);
  });
  it("rejects invalid pagination and unknown enquiry categories", () => {
    expect(inboxFilters.safeParse({ tab: "enquiries", page: 0 }).success).toBe(false);
    expect(inboxFilters.safeParse({ tab: "enquiries", kind: "private" }).success).toBe(false);
  });
  it("accepts status filters only for known statuses", () => {
    expect(inboxFilters.safeParse({ tab: "enquiries", status: "approved" }).success).toBe(true);
    expect(inboxFilters.safeParse({ tab: "enquiries", status: "pending" }).success).toBe(false);
  });
});
describe("enquiry approval workflow", () => {
  it("allows submitted enquiries to move to any working or final status", () => {
    for (const to of ["in_review", "approved", "declined", "closed"]) expect(canTransitionEnquiry("submitted", to)).toBe(true);
  });
  it("allows in-review enquiries to be decided or closed, but not reopened", () => {
    for (const to of ["approved", "declined", "closed"]) expect(canTransitionEnquiry("in_review", to)).toBe(true);
    expect(canTransitionEnquiry("in_review", "submitted")).toBe(false);
  });
  it("treats approved, declined and closed as final", () => {
    for (const from of ["approved", "declined", "closed"]) {
      for (const to of ["submitted", "in_review", "approved", "declined", "closed"]) expect(canTransitionEnquiry(from, to)).toBe(false);
    }
  });
  it("never allows an unknown current status to transition", () => {
    expect(canTransitionEnquiry("whatever", "approved")).toBe(false);
  });
  it("validates decisions with matching from/to statuses", () => {
    expect(enquiryDecision.safeParse({ id: user, from: "submitted", to: "approved" }).success).toBe(true);
    expect(enquiryDecision.safeParse({ id: user, from: "submitted", to: "pending" }).success).toBe(false);
    expect(enquiryDecision.safeParse({ id: "nope", from: "submitted", to: "approved" }).success).toBe(false);
  });
  it("labels statuses for display", () => {
    expect(enquiryStatusLabel("in_review")).toBe("In review");
    expect(enquiryStatusLabel(null)).toBe("Submitted");
  });
});