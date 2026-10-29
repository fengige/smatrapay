import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
const connection = process.env["SUPABASE_DB_URL"];
const sql = connection ? postgres(connection, { max: 1 }) : null;
afterAll(async () => { await sql?.end(); });
describe.skipIf(!sql)("installed Pay-as-you-go approval enforcement", () => {
  it("rejects application inserts for pending products and accepts exact approved terms", async () => {
    if (!sql) throw new Error("Database required");
    await sql.begin(async tx => {
      await tx`SET LOCAL ROLE service_role`;
      const rows = await tx`INSERT INTO public.payg_products(vendor_id,name,down_payment,instalment_amount,instalment_count,instalment_frequency,price,approval_status) VALUES('11111111-1111-4111-8111-111111111111','Approval transaction test',2800,65,480,'daily',34000,'pending') RETURNING id`;
      const productId = rows[0]?.["id"];
      const terms = { down_payment_cents: 280000, instalment_cents: 6500, instalment_count: 480, frequency: "daily", total_cents: 3400000 };
      await expect(tx.savepoint(async sp => { await sp`INSERT INTO public.payg_applications(resident_id,vendor_id,product_id,product_name,full_name,phone,delivery_address,terms) VALUES('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',${productId},'Approval transaction test','Resident test','0722123456','Nairobi test address',${sp.json(terms)})`; })).rejects.toThrow("Approved product");
      await tx`UPDATE public.payg_products SET approval_status='approved' WHERE id=${productId}`;
      const app = await tx`INSERT INTO public.payg_applications(resident_id,vendor_id,product_id,product_name,full_name,phone,delivery_address,terms) VALUES('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',${productId},'Approval transaction test','Resident test','0722123456','Nairobi test address',${tx.json(terms)}) RETURNING status`;
      expect(app[0]?.["status"]).toBe("pending");
      await tx`DELETE FROM public.payg_applications WHERE product_id=${productId}`;
      await tx`DELETE FROM public.payg_products WHERE id=${productId}`;
    });
  });
  it("rejects unauthorized application review", async () => {
    if (!sql) throw new Error("Database required");
    await expect(sql.begin(async tx => { await tx`SET LOCAL ROLE authenticated`; await tx`SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true)`; await tx`SELECT public.review_payg_application('22222222-2222-4222-8222-222222222222','approved','')`; })).rejects.toThrow("Admin required");
  });
  it("vendor cannot set product approval or transfer ownership", async () => {
    if (!sql) throw new Error("Database required");
    await sql.begin(async tx => {
      await tx`SET LOCAL ROLE service_role`;
      const rows = await tx`INSERT INTO public.payg_products(vendor_id,name,approval_status) VALUES('11111111-1111-4111-8111-111111111111','Vendor approval test','approved') RETURNING id`;
      const id = rows[0]?.["id"];
      await tx`RESET ROLE`;
      await tx`SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true)`;
      await tx`UPDATE public.payg_products SET approval_status='approved',name='Edited test' WHERE id=${id}`;
      const saved = await tx`SELECT approval_status FROM public.payg_products WHERE id=${id}`;
      expect(saved[0]?.["approval_status"]).toBe("pending");
      await expect(tx.savepoint(async sp => { await sp`UPDATE public.payg_products SET vendor_id='22222222-2222-4222-8222-222222222222' WHERE id=${id}`; })).rejects.toThrow("Ownership");
      await tx`DELETE FROM public.payg_products WHERE id=${id}`;
    });
  });
});