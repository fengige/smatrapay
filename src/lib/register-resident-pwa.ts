import { refuseAppWorker } from "./resident-mobile";

export async function registerResidentPwa() {
  if (!("serviceWorker" in navigator)) return;
  if (refuseAppWorker({ production: import.meta.env.PROD, framed: window.self !== window.top, hostname: location.hostname, search: location.search })) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.filter((r) => [r.active, r.waiting, r.installing].some((w) => w && new URL(w.scriptURL).pathname === "/sw.js")).map((r) => r.unregister()));
    return;
  }
  // This module is the only registrar. No session, API or private page is precached.
  const { registerSW } = await import("virtual:pwa-register");
  registerSW({ immediate: true });
}