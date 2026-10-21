import { describe, expect, it } from "vitest";
import { enquiryReply, inboxFilters, mayReadResidentInbox } from "../resident-inbox";
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
});