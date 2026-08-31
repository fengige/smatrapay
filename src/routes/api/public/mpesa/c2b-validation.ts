import { createFileRoute } from "@tanstack/react-router";

/** Daraja C2B validation callback: accept the payment attempt. */
export const Route = createFileRoute("/api/public/mpesa/c2b-validation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await request.json();
        } catch {
          /* ignore malformed payloads */
        }
        return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
      },
    },
  },
});
