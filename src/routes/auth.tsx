import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/auth")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/app/auth", search });
  },
});
