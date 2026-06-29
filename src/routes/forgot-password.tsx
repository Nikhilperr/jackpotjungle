import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/forgot-password")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/app/forgot-password", search });
  },
});
