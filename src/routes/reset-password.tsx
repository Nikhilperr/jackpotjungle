import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/reset-password")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/app/reset-password", search });
  },
});
