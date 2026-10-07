import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type VendingPeriod = "7d" | "30d" | "90d" | "all";

export type VendingFailureGroup = {
  operation: string;
  error_code: string;
  count: number;
};

export type VendingSoftwarePerf = {
  software_id: string | null;
  software_name: string;
  tokens: number;
  units: number;
  amount: number;
  failed_attempts: number;
  failures: VendingFailureGroup[];
};

export type VendingMeterPerf = {
  meter_id: string;
  meter_number: string;
  software_name: string;
  tokens: number;
  units: number;
  amount: number;
  failed_attempts: number;
  last_attempt_at: string | null;
};

export type VendingPerformanceSummary = {
  total_tokens: number;
  total_units: number;
  total_amount: number;
  total_failed_attempts: number;
  active_meters: number;
  softwares: VendingSoftwarePerf[];
  meters: VendingMeterPerf[];
  failure_breakdown: VendingFailureGroup[];
};

const PERIOD_DAYS: Record<Exclude<VendingPeriod, "all">, number> = { "7d": 7, "30d": 30, "90d": 90 };

/** Admin-only vending performance: tokens per software and per meter, plus failed vending attempts. */
export const getVendingPerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ period: z.enum(["7d", "30d", "90d", "all"]).default("30d") }).parse(d),
  )
  .handler(async ({ data, context }): Promise<VendingPerformanceSummary> => {
    const { supabase, userId } = context as any;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Admin access required");

    const since =
      data.period === "all"
        ? null
        : new Date(Date.now() - PERIOD_DAYS[data.period] * 86400000).toISOString();

    let tokenQuery = (supabase as any)
      .from("meter_tokens")
      .select("id, meter_id, vending_software_id, action, units, amount, created_at")
      .order("created_at", { ascending: false })
      .limit(10000);
    if (since) tokenQuery = tokenQuery.gte("created_at", since);
    const { data: tokenRows, error: tokenError } = await tokenQuery;
    if (tokenError) throw new Error(tokenError.message);

    let logQuery = (supabase as any)
      .from("vending_integration_logs")
      .select(
        "id, meter_id, vending_software_id, operation, success, error_code, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(10000);
    if (since) logQuery = logQuery.gte("created_at", since);
    const { data: logRows, error: logError } = await logQuery;
    if (logError) throw new Error(logError.message);

    const tokens = (tokenRows ?? []) as any[];
    const logs = (logRows ?? []) as any[];

    const softwareIds = [
      ...new Set(
        [
          ...tokens.map((t) => t.vending_software_id).filter(Boolean),
          ...logs.map((l) => l.vending_software_id).filter(Boolean),
        ] as string[],
      ),
    ];
    const meterIds = [
      ...new Set(
        [
          ...tokens.map((t) => t.meter_id).filter(Boolean),
          ...logs.map((l) => l.meter_id).filter(Boolean),
        ] as string[],
      ),
    ];

    const [swRes, meterRes] = await Promise.all([
      softwareIds.length
        ? (supabase as any)
            .from("vending_software")
            .select("vending_software_id, name")
            .in("vending_software_id", softwareIds)
        : Promise.resolve({ data: [] as any[] }),
      meterIds.length
        ? (supabase as any).from("meters").select("id, meter_number").in("id", meterIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const softwareName = new Map<string, string>(
      ((swRes.data ?? []) as any[]).map((s) => [s.vending_software_id as string, s.name as string]),
    );
    const meterNumber = new Map<string, string>(
      ((meterRes.data ?? []) as any[]).map((m) => [m.id as string, m.meter_number as string]),
    );

    type Bucket = { tokens: number; units: number; amount: number; failures: number; failureMap: Map<string, number> };
    const newBucket = (): Bucket => ({ tokens: 0, units: 0, amount: 0, failures: 0, failureMap: new Map() });
    const addFailure = (b: Bucket, operation: string, errorCode: string) => {
      b.failures += 1;
      const key = `${operation}||${errorCode}`;
      b.failureMap.set(key, (b.failureMap.get(key) ?? 0) + 1);
    };
    const toGroups = (b: Bucket): VendingFailureGroup[] =>
      [...b.failureMap.entries()]
        .map(([key, count]) => {
          const [operation = "unknown", error_code = "unknown"] = key.split("||");
          return { operation, error_code, count };
        })
        .sort((a, z) => z.count - a.count);

    const softwareBuckets = new Map<string, Bucket>();
    const meterBuckets = new Map<string, Bucket>();
    const meterLastAttempt = new Map<string, string>();

    for (const t of tokens) {
      const sk = (t.vending_software_id as string) ?? "unassigned";
      const mk = t.meter_id as string;
      const sb = softwareBuckets.get(sk) ?? newBucket();
      sb.tokens += 1;
      sb.units += Number(t.units ?? 0);
      sb.amount += Number(t.amount ?? 0);
      softwareBuckets.set(sk, sb);
      if (!mk) continue;
      const mb = meterBuckets.get(mk) ?? newBucket();
      mb.tokens += 1;
      mb.units += Number(t.units ?? 0);
      mb.amount += Number(t.amount ?? 0);
      meterBuckets.set(mk, mb);
      const at = t.created_at as string;
      if (!meterLastAttempt.get(mk) || at > (meterLastAttempt.get(mk) as string)) meterLastAttempt.set(mk, at);
    }

    for (const l of logs) {
      if (l.success) continue;
      const operation = (l.operation as string) || "unknown";
      const errorCode = (l.error_code as string) || "unknown";
      const sk = (l.vending_software_id as string) ?? "unassigned";
      const sb = softwareBuckets.get(sk) ?? newBucket();
      addFailure(sb, operation, errorCode);
      softwareBuckets.set(sk, sb);
      const mk = l.meter_id as string;
      if (!mk) continue;
      const mb = meterBuckets.get(mk) ?? newBucket();
      addFailure(mb, operation, errorCode);
      meterBuckets.set(mk, mb);
      const at = l.created_at as string;
      if (!meterLastAttempt.get(mk) || at > (meterLastAttempt.get(mk) as string)) meterLastAttempt.set(mk, at);
    }

    const softwares: VendingSoftwarePerf[] = [...softwareBuckets.entries()]
      .map(([id, b]) => ({
        software_id: id === "unassigned" ? null : id,
        software_name: id === "unassigned" ? "Unassigned" : (softwareName.get(id) ?? "Unknown"),
        tokens: b.tokens,
        units: b.units,
        amount: b.amount,
        failed_attempts: b.failures,
        failures: toGroups(b),
      }))
      .sort((a, z) => z.tokens - a.tokens);

    const meters: VendingMeterPerf[] = [...meterBuckets.entries()]
      .map(([id, b]) => ({
        meter_id: id,
        meter_number: meterNumber.get(id) ?? "—",
        software_name: "—",
        tokens: b.tokens,
        units: b.units,
        amount: b.amount,
        failed_attempts: b.failures,
        last_attempt_at: meterLastAttempt.get(id) ?? null,
      }))
      .sort((a, z) => z.tokens - a.tokens || z.failed_attempts - a.failed_attempts);

    // Fill the vending software a meter is assigned to.
    if (meters.length) {
      const { data: meterSoftwares } = await (supabase as any)
        .from("meters")
        .select("id, vending_software_id")
        .in("id", meters.map((m) => m.meter_id));
      for (const m of meters) {
        const ms = ((meterSoftwares ?? []) as any[]).find((x) => x.id === m.meter_id);
        m.software_name = ms?.vending_software_id ? (softwareName.get(ms.vending_software_id) ?? "—") : "—";
      }
    }

    const totalFailureMap = new Map<string, number>();
    for (const s of softwares)
      for (const f of s.failures) {
        const key = `${f.operation}||${f.error_code}`;
        totalFailureMap.set(key, (totalFailureMap.get(key) ?? 0) + f.count);
      }
    const failure_breakdown: VendingFailureGroup[] = [...totalFailureMap.entries()]
      .map(([key, count]) => {
        const [operation = "unknown", error_code = "unknown"] = key.split("||");
        return { operation, error_code, count };
      })
      .sort((a, z) => z.count - a.count);

    return {
      total_tokens: softwares.reduce((n, s) => n + s.tokens, 0),
      total_units: softwares.reduce((n, s) => n + s.units, 0),
      total_amount: softwares.reduce((n, s) => n + s.amount, 0),
      total_failed_attempts: softwares.reduce((n, s) => n + s.failed_attempts, 0),
      active_meters: meters.filter((m) => m.tokens > 0 || m.failed_attempts > 0).length,
      softwares,
      meters,
      failure_breakdown,
    };
  });
