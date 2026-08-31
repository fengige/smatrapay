import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/configurations/")({
  beforeLoad: () => {
    throw redirect({ to: "/configurations/app-settings", replace: true });
  },
});
