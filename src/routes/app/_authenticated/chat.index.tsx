import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/_authenticated/chat/")({
  beforeLoad: async () => {
    // Use cached role only — a network roles query here blocked every chat
    // visit and raced with admin.tsx's !isAdmin → /app/chat redirect.
    if (typeof window === "undefined") return;
    const cached = localStorage.getItem("jj_user_role");
    if (cached === "admin" || cached === "super_admin") {
      throw redirect({ to: "/app/admin" });
    }
  },
  component: () => null,
});

