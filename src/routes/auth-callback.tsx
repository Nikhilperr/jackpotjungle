import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/auth-callback")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/app/auth-callback", search });
  },
});
