import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/friends")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/app/friends", search });
  },
});
