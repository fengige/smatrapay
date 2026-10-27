import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/mpesa/payg-callback")({
  server: { handlers: { POST: async ({ request }) => {
    const { handlePaygCallback } = await import("@/lib/payg-payment.server");
    return handlePaygCallback(request);
  } } },
});