import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ location }) => {
    throw redirect({ to: `/app${location.pathname}`, search: location.search });
  },
});
