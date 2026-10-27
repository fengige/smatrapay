/**
 * Token units are TRUNCATED (never rounded) to exactly one decimal place.
 * Uses string/BigInt arithmetic so floating-point noise (e.g. 12.3 stored as
 * 12.2999999) can never drop or add a tenth.
 */

/** Exact decimal string of a finite number, without exponent notation. */
function plainDecimal(n: number): string {
  const s = String(n);
  if (!/e/i.test(s)) return s;
  const [mant = "0", expStr = "0"] = s.toLowerCase().split("e");
  const exp = Number(expStr);
  const neg = mant.startsWith("-");
  const [i = "0", f = ""] = mant.replace("-", "").split(".");
  const digits = i + f;
  const point = i.length + exp;
  let out: string;
  if (point <= 0) out = "0." + "0".repeat(-point) + digits;
  else if (point >= digits.length) out = digits + "0".repeat(point - digits.length);
  else out = digits.slice(0, point) + "." + digits.slice(point);
  return (neg ? "-" : "") + out;
}

/** Units in tenths (integer), truncated toward zero. */
export function unitsToTenths(value: number | string | null | undefined): bigint {
  const n = typeof value === "string" ? Number(value) : Number(value ?? 0);
  if (!Number.isFinite(n)) return 0n;
  const s = typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim()) ? value.trim() : plainDecimal(n);
  const neg = s.startsWith("-");
  const [i, f = ""] = s.replace("-", "").split(".");
  const tenths = BigInt(i || "0") * 10n + BigInt((f[0] ?? "0"));
  return neg ? -tenths : tenths;
}

/** 12.39 -> 12.3, 12.30 -> 12.3, 0.09 -> 0 */
export function truncateUnits(value: number | string | null | undefined): number {
  return Number(unitsToTenths(value)) / 10;
}

/** Display string with exactly one decimal place: 12.39 -> "12.3", 0.09 -> "0.0". */
export function formatUnits(value: number | string | null | undefined): string {
  const t = unitsToTenths(value);
  const neg = t < 0n;
  const a = neg ? -t : t;
  return `${neg ? "-" : ""}${a / 10n}.${a % 10n}`;
}

/** Decimal string -> integer scaled by 10^dp (truncating extra digits). */
function scaled(value: number, dp: number): bigint {
  const s = plainDecimal(value);
  const neg = s.startsWith("-");
  const [i, f = ""] = s.replace("-", "").split(".");
  const v = BigInt(i || "0") * 10n ** BigInt(dp) + BigInt((f + "0".repeat(dp)).slice(0, dp) || "0");
  return neg ? -v : v;
}

/**
 * Units bought by a money amount at a unit price, truncated to one decimal.
 * The amount is treated at its money precision (cents) without changing it.
 */
export function unitsFromAmount(amount: number, pricePerUnit: number): number {
  if (!(pricePerUnit > 0) || !(amount > 0)) return 0;
  const cents = BigInt(Math.round(amount * 100));
  const price = scaled(pricePerUnit, 6); // price * 1e6
  if (price <= 0n) return 0;
  // units*10 = cents/100 * 10 / (price/1e6) = cents * 1e6 / (price * 10)
  const tenths = (cents * 1_000_000n) / (price * 10n);
  return Number(tenths) / 10;
}
