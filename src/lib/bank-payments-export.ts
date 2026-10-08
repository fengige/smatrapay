import type { BankPaymentExportRow } from "@/lib/ncba.functions";

/** Columns exported for bank payments. Never includes the vend token, credentials or secrets. */
export const EXPORT_COLUMNS: { header: string; value: (r: BankPaymentExportRow) => string | number | null }[] = [
  { header: "Bank", value: (r) => r.bank },
  { header: "TransID", value: (r) => r.trans_id },
  { header: "Meter", value: (r) => r.meter_number },
  { header: "Owner", value: (r) => r.owner_name },
  { header: "Owner Type", value: (r) => r.owner_type },
  { header: "Amount (KES)", value: (r) => r.trans_amount },
  { header: "Received", value: (r) => new Date(r.created_at).toLocaleString() },
  { header: "Transaction Time", value: (r) => r.trans_time },
  { header: "Mobile", value: (r) => r.mobile },
  { header: "Customer Name", value: (r) => r.payer_name },
  { header: "BusinessShortCode", value: (r) => r.business_short_code },
  { header: "Bank Reference", value: (r) => r.bank_reference ?? r.bill_ref_number },
  { header: "Status", value: (r) => r.status },
  { header: "Commission %", value: (r) => r.commission_percentage },
  { header: "Commission (KES)", value: (r) => r.commission_amount },
  { header: "VAT on Commission %", value: (r) => r.vat_on_commission_percentage },
  { header: "VAT on Commission (KES)", value: (r) => r.vat_on_commission_amount },
  { header: "Net Amount (KES)", value: (r) => r.net_amount },
  { header: "Token Status", value: (r) => (r.status === "completed" ? "Generated" : "Not generated") },
  { header: "SMS Status", value: (r) => r.sms_status },
  { header: "Reason", value: (r) => r.error_message },
  { header: "Attempts", value: (r) => r.attempts },
];

export function toCsv(rows: BankPaymentExportRow[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    // Guard against spreadsheet formula injection.
    const safe = /^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [EXPORT_COLUMNS.map((c) => esc(c.header)).join(","), ...rows.map((r) => EXPORT_COLUMNS.map((c) => esc(c.value(r))).join(","))].join("\r\n");
}

export function exportFilename(ext: string, from: string, to: string, today = new Date().toISOString().slice(0, 10)): string {
  if (from || to) return `bank-payments-${from || "start"}_to_${to || today}.${ext}`;
  return `bank-payments-${today}.${ext}`;
}
