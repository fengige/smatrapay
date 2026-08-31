import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy settings path — configuration now lives under /configurations. */
export const Route = createFileRoute("/_authenticated/admin/settings")({
  beforeLoad: () => {
    throw redirect({ to: "/configurations/app-settings", replace: true });
  },
});
