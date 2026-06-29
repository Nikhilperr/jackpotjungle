import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/chat/page")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/app/chat/page", search });
  },
});
