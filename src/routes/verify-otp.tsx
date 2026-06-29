import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/verify-otp")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/app/verify-otp", search });
  },
});
