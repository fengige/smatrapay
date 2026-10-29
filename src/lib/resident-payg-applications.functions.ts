import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { residentScope } from "./resident-portal.functions";
import { readResidentPaygApplicationDetail } from "./resident-payg-applications.server";

export const getResidentPaygApplicationDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { db } = await residentScope(context as any);
    return readResidentPaygApplicationDetail(context.supabase, db, context.userId, data.id);
  });