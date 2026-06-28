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

    // Check cached status to avoid blocking network queries on every transition
    const isCachedComplete = typeof window !== "undefined" && localStorage.getItem("profile_complete") === "true";
    let isProfileComplete = isCachedComplete;
    let profile = null;

    if (!isProfileComplete) {
      const { data } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", session.user.id)
        .maybeSingle();

      profile = data;
      isProfileComplete = !!(profile?.first_name?.trim() && profile?.last_name?.trim());
      if (isProfileComplete && typeof window !== "undefined") {
        localStorage.setItem("profile_complete", "true");
      }
    }
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
