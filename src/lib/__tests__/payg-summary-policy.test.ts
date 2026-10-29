import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const connection = process.env["SUPABASE_DB_URL"];
const sql = connection ? postgres(connection, { max: 1 }) : null;
afterAll(async () => { await sql?.end(); });

describe.skipIf(!sql)("Pay-as-you-go summary database isolation", () => {
  it("enforces vendor-owned saves, cross-vendor denial and assigned resident reads", async () => {
    if (!sql) throw new Error("Database required");
    const rollback = new Error("ROLLBACK_TEST");
    try {
      await sql.begin(async tx => {
        const relations = await tx`SELECT a.user_id AS resident, m.vendor_id AS vendor
          FROM public.unit_assignments a JOIN public.meters m ON m.unit_id=a.unit_id
          JOIN public.users u ON u.id=a.user_id
          WHERE a.role='resident' AND (a.end_date IS NULL OR a.end_date>=CURRENT_DATE)
            AND u.status='active' AND public.has_role(a.user_id,'resident')
            AND public.has_role(m.vendor_id::uuid,'vendor') LIMIT 1`;
        const vendorA = relations[0]?.["vendor"] as string | undefined;
        const resident = relations[0]?.["resident"] as string | undefined;
        if (!vendorA || !resident) throw new Error("A related vendor/resident fixture is required");
        const others = await tx`SELECT user_id FROM public.user_roles WHERE role='vendor'
          AND user_id<>${vendorA}::uuid AND NOT EXISTS (
            SELECT 1 FROM public.unit_assignments a JOIN public.meters m ON m.unit_id=a.unit_id
            WHERE a.user_id=${resident}::uuid AND a.role='resident'
              AND (a.end_date IS NULL OR a.end_date>=CURRENT_DATE) AND m.vendor_id=user_roles.user_id::text
          ) LIMIT 1`;
        const vendorB = others[0]?.["user_id"] as string | undefined;
        if (!vendorB) throw new Error("An unrelated vendor fixture is required");
        await tx`INSERT INTO public.payg_service_summaries(vendor_id,summary_text)
          VALUES (${vendorA}::uuid,'A test summary'),(${vendorB}::uuid,'B test summary')
          ON CONFLICT(vendor_id) DO UPDATE SET summary_text=excluded.summary_text`;
        await tx.unsafe("SET LOCAL ROLE authenticated");
        await tx`SELECT set_config('request.jwt.claim.sub',${vendorA},true)`;
        const saved = await tx`UPDATE public.payg_service_summaries SET summary_text='A edited summary'
          WHERE vendor_id=${vendorA}::uuid RETURNING summary_text`;
        expect(saved[0]?.["summary_text"]).toBe("A edited summary");
        expect(await tx`SELECT vendor_id FROM public.payg_service_summaries WHERE vendor_id=${vendorB}::uuid`).toHaveLength(0);
        expect(await tx`UPDATE public.payg_service_summaries SET summary_text='Unauthorized'
          WHERE vendor_id=${vendorB}::uuid RETURNING vendor_id`).toHaveLength(0);
        await tx`SELECT set_config('request.jwt.claim.sub',${vendorB},true)`;
        expect((await tx`SELECT summary_text FROM public.payg_service_summaries WHERE vendor_id=${vendorB}::uuid`)[0]?.["summary_text"]).toBe("B test summary");
        expect(await tx`SELECT vendor_id FROM public.payg_service_summaries WHERE vendor_id=${vendorA}::uuid`).toHaveLength(0);
        await tx`SELECT set_config('request.jwt.claim.sub',${resident},true)`;
        expect((await tx`SELECT summary_text FROM public.payg_service_summaries WHERE vendor_id=${vendorA}::uuid`)[0]?.["summary_text"]).toBe("A edited summary");
        expect(await tx`SELECT vendor_id FROM public.payg_service_summaries WHERE vendor_id=${vendorB}::uuid`).toHaveLength(0);
        expect(await tx`UPDATE public.payg_service_summaries SET summary_text='Resident edit'
          WHERE vendor_id=${vendorA}::uuid RETURNING vendor_id`).toHaveLength(0);
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
  });
});