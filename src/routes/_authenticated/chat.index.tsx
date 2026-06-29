import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/chat/")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/app/chat", search });
  },
});
