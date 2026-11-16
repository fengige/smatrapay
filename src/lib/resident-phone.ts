import { z } from "zod";

export const PHONE_LOGIN_ERROR = "Unable to sign in. Check your registered number and code, or contact management.";
export const PHONE_CODE_MESSAGE = "If this is an eligible registered number, a code will arrive by SMS. It expires in 5 minutes.";
export const PHONE_OTP_TTL = 300;
export const PHONE_RESEND_SECONDS = 60;
export const PHONE_ATTEMPTS = 5;

export function normalizeResidentPhone(raw: string): string {
  let phone = raw.trim().replace(/[\s()-]/g, "");
  if (!/^\+?\d+$/.test(phone)) throw new Error("Enter a valid phone number.");
  if (phone.startsWith("+")) phone = phone.slice(1);
  else if (phone.startsWith("00")) phone = phone.slice(2);
  if (/^0[17]\d{8}$/.test(phone)) phone = `254${phone.slice(1)}`;
  else if (/^[17]\d{8}$/.test(phone)) phone = `254${phone}`;
  if (!/^[1-9]\d{8,14}$/.test(phone) || (phone.startsWith("254") && !/^254[17]\d{8}$/.test(phone))) throw new Error("Enter a valid phone number.");
  return `+${phone}`;
}

export const residentPhoneRequest = z.object({ phone: z.string().min(1).max(30).transform(normalizeResidentPhone) });
export const residentPhoneVerification = z.object({ challenge: z.string().uuid(), code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code.") });

export async function phoneHash(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function randomPhoneCode(): string {
  // Rejection sampling avoids modulo bias.
  const random = new Uint32Array(1);
  do { crypto.getRandomValues(random); } while ((random[0] ?? 0) >= 4294000000);
  return String((random[0] ?? 0) % 1000000).padStart(6, "0");
}