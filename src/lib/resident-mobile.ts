/** Exact tab membership keeps financial enquiries out of payment history. */
export function residentMobileTab(path: string) {
  if (["/resident/payments", "/resident/bills", "/resident/transactions", "/resident/statements"].includes(path)) return "Payments";
  if (["/resident/meters", "/resident/buy-tokens"].includes(path)) return "Utilities";
  if (path === "/resident/jobs") return "Requests";
  if (path === "/resident/dashboard") return "Home";
  return "Account";
}

export function refuseAppWorker({ production, framed, hostname, search }: { production: boolean; framed: boolean; hostname: string; search: string }) {
  const host = hostname.toLowerCase();
  const previewDomain = /\.(lovable\.app|gpt-eng\.com|gptengineer\.run)$/.test(host);
  const label = host.split(".")[0] ?? "";
  return !production || framed || new URLSearchParams(search).get("sw") === "off"
    || (previewDomain && (/^(?:id-preview|preview)(?:-[a-z0-9]+)?--.+$/.test(label) || /^project--.+-dev$/.test(label)))
    || /(^|\.)(lovableproject\.com|lovableproject-dev\.com|beta\.lovable\.dev)$/.test(host);
}