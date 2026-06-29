import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/profile")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/app/profile", search });
  },
});
