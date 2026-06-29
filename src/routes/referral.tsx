import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/referral")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/referrals", search });
  },
});
