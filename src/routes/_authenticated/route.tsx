import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { waitInitialSession } from "@/lib/auth-wait";
import { CallProvider } from "@/components/messenger/CallProvider";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const session = await waitInitialSession();
    if (!session?.user) {
      throw redirect({ to: "/auth" });
    }

    // Check if the user has completed their profile details
    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", session.user.id)
      .maybeSingle();

    const isProfileComplete = !!(profile?.first_name?.trim() && profile?.last_name?.trim());
    const isOnOnboarding = location.pathname.endsWith("/onboarding");

    if (!isProfileComplete && !isOnOnboarding) {
      throw redirect({ to: "/onboarding" });
    }

    if (isProfileComplete && isOnOnboarding) {
      throw redirect({ to: "/chat" });
    }

    return { user: session.user, profile };
  },
  component: () => (
    <CallProvider>
      <Outlet />
    </CallProvider>
  ),
});
