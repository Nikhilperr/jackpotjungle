import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/chat/$friendId")({
  beforeLoad: ({ params, search }) => {
    throw redirect({ to: `/app/chat/${params.friendId}`, search });
  },
});
