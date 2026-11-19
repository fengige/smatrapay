import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applicationListSchema,
  vendorRegistrationSchema,
  vendorReviewSchema,
} from "../vendor-registration";
import {
  notifyApplication,
  provisionApplication,
  requireRegistrationAdmin,
  submitRegistration,
} from "../vendor-registration.server";
vi.mock("../email-templates/send-email", () => ({ sendTemplateEmail: vi.fn() }));
import { sendTemplateEmail } from "../email-templates/send-email";
const input = {
  submission_key: "11111111-1111-4111-8111-111111111111",
  business_name: "Test vendor",
  business_type: "Company",
  registration_number: "REG-1",
  contact_name: "Test applicant",
  email: "APPLICANT@example.test",
  phone: "0712345678",
  location: "Nairobi",
  services: ["Electricity"],
  description: "Business description",
  contact_preference: "Email",
  consent: true,
};
const application = {
  ...vendorRegistrationSchema.parse(input),
  id: "22222222-2222-4222-8222-222222222222",
  reference: "SVA-TEST",
  status: "Accepted",
  vendor_user_id: "33333333-3333-4333-8333-333333333333",
  email_status: "not_sent",
  sms_status: "not_sent",
  email_attempt: 0,
  sms_attempt: 0,
  rejection_reason: "Documents incomplete",
};
function fixture(overrides: Record<string, unknown> = {}) {
  const a = { ...application, ...overrides };
  const writes: { table: string; data: any }[] = [];
  const filters: any[] = [];
  const db: any = {
    rpc: vi.fn(async (name: string) => ({
      data: name === "has_role" || name === "consume_vendor_application_limit",
      error: null,
    })),
    auth: {
      admin: {
        getUserById: vi.fn(async () => ({
          data: {
            user: {
              id: a.vendor_user_id,
              email: a.email,
              app_metadata: { vendor_application_id: a.id },
            },
          },
          error: null,
        })),
        createUser: vi.fn(async () => ({ error: null })),
        updateUserById: vi.fn(async () => ({ error: null })),
        generateLink: vi.fn(async () => ({
          data: { properties: { action_link: "https://example.test/private-setup-link" } },
          error: null,
        })),
      },
    },
    from: vi.fn((table: string) => {
      let patch: any = null;
      let insert: any = null;
      const eqs: any[] = [];
      const q: any = {
        select: () => q,
        insert: (data: any) => {
          insert = data;
          writes.push({ table, data });
          return q;
        },
        update: (data: any) => {
          patch = data;
          writes.push({ table, data });
          return q;
        },
        eq: (k: string, v: any) => {
          eqs.push([k, v]);
          filters.push([table, k, v]);
          return q;
        },
        single: async () => ({
          data:
            table === "sms_configurations"
              ? {
                  id: "config",
                  provider_code: "tiara",
                  api_url: "https://sms.example.test",
                  api_key: "test-key",
                  sender_id: "CONFIGURED",
                }
              : table === "sms_messages"
                ? { id: "sms-log" }
                : insert
                  ? { reference: "SVA-TEST", status: "Pending" }
                  : { ...a },
          error: null,
        }),
        maybeSingle: async () => {
          if (patch) {
            if (eqs.some(([k, v]) => a[k as keyof typeof a] !== v))
              return { data: null, error: null };
            Object.assign(a, patch);
            return { data: { id: a.id }, error: null };
          }
          if (table === "sms_configurations") return q.single();
          return { data: overrides["existing"] ?? null, error: null };
        },
        then: (resolve: any) => {
          if (
            patch &&
            table === "vendor_applications" &&
            !eqs.some(([k, v]) => a[k as keyof typeof a] !== v)
          )
            Object.assign(a, patch);
          return resolve({ error: null });
        },
      };
      return q;
    }),
  };
  return { db, a, writes, filters };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(sendTemplateEmail).mockResolvedValue({ sent: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ status: "SUCCESS", statusCode: 0, msgId: "sms-id" }), {
          status: 200,
        }),
    ),
  );
});
describe("vendor application rules", () => {
  it("normalizes registered email and Kenyan phone", () =>
    expect(vendorRegistrationSchema.parse(input)).toMatchObject({
      email: "applicant@example.test",
      phone: "+254712345678",
    }));
  it("requires declaration consent", () =>
    expect(vendorRegistrationSchema.safeParse({ ...input, consent: false }).success).toBe(false));
  it("requires at least one supported service", () => {
    expect(vendorRegistrationSchema.safeParse({ ...input, services: [] }).success).toBe(false);
    expect(
      vendorRegistrationSchema.safeParse({ ...input, services: ["Unsupported"] }).success,
    ).toBe(false);
  });
  it("reports invalid phones without throwing outside schema validation", () =>
    expect(vendorRegistrationSchema.safeParse({ ...input, phone: "" }).success).toBe(false));
  it("requires rejection reason", () =>
    expect(
      vendorReviewSchema.safeParse({ id: application.id, decision: "Rejected", reason: " " })
        .success,
    ).toBe(false));
  it("bounds administrator pagination", () =>
    expect(applicationListSchema.safeParse({ page: 0, limit: 1000 }).success).toBe(false));
  it("only inserts a pending application, never an account or role", async () => {
    const f = fixture();
    expect(
      await submitRegistration(f.db, vendorRegistrationSchema.parse(input), "test-ip"),
    ).toEqual({ reference: "SVA-TEST", status: "Pending" });
    expect(f.writes.map((w) => w.table)).toEqual(["vendor_applications"]);
    expect(f.db.auth.admin.createUser).not.toHaveBeenCalled();
  });
  it("returns a safe acknowledgement on the same submission retry", async () => {
    const f = fixture({
      existing: {
        email: application.email,
        phone: application.phone,
        reference: "SVA-TEST",
        status: "Pending",
      },
    });
    expect(
      await submitRegistration(f.db, vendorRegistrationSchema.parse(input), "test-ip"),
    ).toEqual({ reference: "SVA-TEST", status: "Pending" });
    expect(f.writes).toHaveLength(0);
  });
  it("rate limits intake before writes", async () => {
    const f = fixture();
    f.db.rpc.mockResolvedValue({ data: false, error: null });
    await expect(
      submitRegistration(f.db, vendorRegistrationSchema.parse(input), "test-ip"),
    ).rejects.toThrow("Too many");
    expect(f.writes).toHaveLength(0);
  });
  it("denies nonadministrators before privileged work", async () => {
    const f = fixture();
    f.db.rpc.mockResolvedValue({ data: false, error: null });
    await expect(requireRegistrationAdmin(f.db, "vendor")).rejects.toThrow("Administrator");
  });
  it("creates the exact reserved Auth ID once and completes the existing profile/role transaction", async () => {
    const f = fixture();
    f.db.auth.admin.getUserById.mockResolvedValueOnce({
      data: { user: null },
      error: { status: 404 },
    });
    await provisionApplication(f.db, f.a as any, "admin");
    await provisionApplication(f.db, f.a as any, "admin");
    expect(f.db.auth.admin.createUser).toHaveBeenCalledTimes(1);
    expect(f.db.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        id: application.vendor_user_id,
        email: application.email,
        ban_duration: "876000h",
        app_metadata: { vendor_application_id: application.id },
      }),
    );
    expect(f.db.rpc).toHaveBeenCalledWith("complete_vendor_application", {
      p_id: application.id,
      p_actor: "admin",
    });
  });
  it("refuses an unrelated reserved account", async () => {
    const f = fixture();
    f.db.auth.admin.getUserById.mockResolvedValue({
      data: { user: { email: "foreign@example.test", app_metadata: {} } },
      error: null,
    });
    await expect(provisionApplication(f.db, f.a as any, "admin")).rejects.toThrow("mismatch");
    expect(f.db.auth.admin.createUser).not.toHaveBeenCalled();
  });
  it("sends acceptance to submitted contacts with a private setup link only in email", async () => {
    const f = fixture();
    await notifyApplication(f.db, application.id, "admin");
    expect(sendTemplateEmail).toHaveBeenCalledWith(
      "vendor-accepted",
      application.email,
      expect.objectContaining({
        templateData: expect.objectContaining({
          setupUrl: "https://example.test/private-setup-link",
        }),
      }),
    );
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]?.[1]?.body as string);
    expect(body).toMatchObject({ from: "CONFIGURED", to: "254712345678" });
    expect(body.message).toContain("https://apps.smatrapay.com/login");
    expect(JSON.stringify(f.writes)).not.toContain("private-setup-link");
    expect(f.a.email_status).toBe("sent");
    expect(f.a.sms_status).toBe("sent");
  });
  it("rejection notifies both contacts with reason and never creates a user", async () => {
    const f = fixture({ status: "Rejected", vendor_user_id: null });
    await notifyApplication(f.db, application.id, "admin");
    expect(sendTemplateEmail).toHaveBeenCalledWith(
      "vendor-rejected",
      application.email,
      expect.objectContaining({
        templateData: expect.objectContaining({ reason: "Documents incomplete", setupUrl: "" }),
      }),
    );
    expect(f.db.auth.admin.createUser).not.toHaveBeenCalled();
    expect(f.db.auth.admin.generateLink).not.toHaveBeenCalled();
  });
  it("retries a failed email without repeating successful SMS or account creation", async () => {
    const f = fixture();
    vi.mocked(sendTemplateEmail).mockRejectedValueOnce(new Error("domain_not_verified"));
    await notifyApplication(f.db, application.id, "admin");
    expect(f.a.email_status).toBe("failed");
    expect(f.a.sms_status).toBe("sent");
    await notifyApplication(f.db, application.id, "admin");
    expect(sendTemplateEmail).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(f.db.auth.admin.createUser).not.toHaveBeenCalled();
  });
  it("permits retry after explicit SMS provider rejection", async () => {
    const f = fixture();
    vi.mocked(fetch).mockResolvedValueOnce(new Response("refused", { status: 400 }));
    await notifyApplication(f.db, application.id, "admin");
    expect(f.a.sms_status).toBe("failed");
    await notifyApplication(f.db, application.id, "admin");
    expect(f.a.sms_status).toBe("sent");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sendTemplateEmail).toHaveBeenCalledTimes(1);
  });
  it("never automatically retries uncertain SMS", async () => {
    const f = fixture();
    vi.mocked(fetch).mockRejectedValueOnce(new Error("timeout"));
    await notifyApplication(f.db, application.id, "admin");
    expect(f.a.sms_status).toBe("uncertain");
    await notifyApplication(f.db, application.id, "admin");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("does not bypass email suppression", async () => {
    const f = fixture();
    vi.mocked(sendTemplateEmail).mockResolvedValue({ sent: false, reason: "recipient_suppressed" });
    await notifyApplication(f.db, application.id, "admin");
    await notifyApplication(f.db, application.id, "admin");
    expect(f.a.email_status).toBe("suppressed");
    expect(sendTemplateEmail).toHaveBeenCalledTimes(1);
  });
  it("concurrent notification clicks claim each channel only once", async () => {
    const f = fixture();
    await Promise.all([
      notifyApplication(f.db, application.id, "admin"),
      notifyApplication(f.db, application.id, "admin"),
    ]);
    expect(sendTemplateEmail).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
