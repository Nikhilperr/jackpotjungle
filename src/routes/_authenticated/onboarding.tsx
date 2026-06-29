import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/onboarding")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/app/onboarding", search });
  },
});
