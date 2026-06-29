import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/vip-club")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/vip", search });
  },
});
