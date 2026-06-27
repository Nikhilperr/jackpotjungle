import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { waitInitialSession } from "@/lib/auth-wait";
import { CallProvider } from "@/components/messenger/CallProvider";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const session = await waitInitialSession();
    if (!session?.user) {
      throw redirect({ to: "/auth" });
    }
    return { user: session.user };
  },
  component: () => (
    <CallProvider>
      <Outlet />
    </CallProvider>
  ),
});
