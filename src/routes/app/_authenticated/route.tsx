import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { waitInitialSession } from "@/lib/auth-wait";
import { CallProvider } from "@/components/messenger/CallProvider";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const session = await waitInitialSession();
    if (!session?.user) {
      throw redirect({ to: "/app/auth" });
    }

    // Check cached status to avoid blocking network queries on every transition
    let isCachedComplete = false;
    try {
      isCachedComplete = typeof window !== "undefined" && localStorage.getItem("profile_complete") === "true";
    } catch (e) {
      console.warn("localStorage item check failed:", e);
    }
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
        try {
          localStorage.setItem("profile_complete", "true");
        } catch (e) {
          console.warn("localStorage item write failed:", e);
        }
      }
    }
    const isOnOnboarding = location.pathname.endsWith("/onboarding");

    if (!isProfileComplete && !isOnOnboarding) {
      throw redirect({ to: "/app/onboarding" });
    }

    if (isProfileComplete && isOnOnboarding) {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);
      const isAdmin = !!roles?.some((r: any) => r.role === "admin" || r.role === "super_admin");
      throw redirect({ to: isAdmin ? "/app/admin" : "/app/chat" });
    }

    return { user: session.user, profile };
  },
  component: () => (
    <CallProvider>
      <Outlet />
    </CallProvider>
  ),
});
