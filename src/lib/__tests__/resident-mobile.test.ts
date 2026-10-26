import { describe, expect, it } from "vitest";
import { refuseAppWorker, residentMobileTab } from "../resident-mobile";
describe("resident mobile boundaries", () => {
  it("uses exactly the five requested tabs", () => {
    expect(["dashboard", "payments", "meters", "jobs", "profile"].map((p) => residentMobileTab(`/resident/${p}`))).toEqual(["Home", "Payments", "Utilities", "Requests", "Account"]);
    expect(residentMobileTab("/resident/buy-tokens")).toBe("Utilities");
    expect(residentMobileTab("/resident/insurance")).toBe("Account");
  });
  const base = { production: true, framed: false, hostname: "apps.smatrapay.com", search: "" };
  it("refuses offline workers in development", () => expect(refuseAppWorker({ ...base, production: false })).toBe(true));
  it("refuses offline workers in embedded previews", () => expect(refuseAppWorker({ ...base, framed: true })).toBe(true));
  it("refuses every supported preview hostname", () => {
    for (const hostname of ["id-preview--abc.lovable.app", "preview-v2--abc.gpt-eng.com", "preview--abc.gptengineer.run", "project--abc-dev.lovable.app", "abc.lovableproject.com", "lovableproject-dev.com", "beta.lovable.dev"]) expect(refuseAppWorker({ ...base, hostname })).toBe(true);
  });
  it("honors the offline kill switch", () => expect(refuseAppWorker({ ...base, search: "?sw=off" })).toBe(true));
  it("allows published custom domains only outside previews", () => expect(refuseAppWorker(base)).toBe(false));
});