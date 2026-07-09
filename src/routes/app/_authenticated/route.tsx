import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { waitInitialSession, getVerifiedStatus, setVerifiedStatus } from "@/lib/auth-wait";
import { CallProvider } from "@/components/messenger/CallProvider";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const session = await waitInitialSession();
    if (!session?.user) {
      if (typeof window !== "undefined") {
        setVerifiedStatus(false);
        sessionStorage.setItem("jj_invite_redirect", window.location.href);
      }
      throw redirect({ to: "/app/auth" });
    }

    const isGoogleLogin = session?.user?.app_metadata?.provider === "google" &&
                          typeof window !== "undefined" &&
                          localStorage.getItem("jj_google_session") !== "false";
    const isVerified = getVerifiedStatus();

    if (!isGoogleLogin && !isVerified) {
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
      try {
        const { data } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", session.user.id)
          .maybeSingle();

        if (data) {
          profile = data;
          isProfileComplete = !!(profile?.first_name?.trim() && profile?.last_name?.trim());
          if (isProfileComplete && typeof window !== "undefined") {
            localStorage.setItem("profile_complete", "true");
          }
        }
      } catch (err) {
        console.error("Failed to query profile completion in route guard:", err);
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
      const userRole = roles?.[0]?.role || "user";
      if (typeof window !== "undefined") {
        localStorage.setItem("jj_user_role", userRole);
      }
      const isAdmin = userRole === "admin" || userRole === "super_admin";
      const savedRedirect = typeof window !== "undefined" ? sessionStorage.getItem("jj_invite_redirect") : null;
      if (savedRedirect) {
        sessionStorage.removeItem("jj_invite_redirect");
        try {
          const urlObj = new URL(savedRedirect);
          throw redirect({ to: urlObj.pathname + urlObj.search });
        } catch (e) {
          if (e && typeof e === "object" && "to" in e) {
            throw e;
          }
        }
      }
      throw redirect({ to: isAdmin ? "/app/admin" : "/app/chat" });
    }

    const savedRedirect = typeof window !== "undefined" ? sessionStorage.getItem("jj_invite_redirect") : null;
    if (savedRedirect) {
      sessionStorage.removeItem("jj_invite_redirect");
      try {
        const urlObj = new URL(savedRedirect);
        throw redirect({ to: urlObj.pathname + urlObj.search });
      } catch (e) {
        if (e && typeof e === "object" && "to" in e) {
          throw e;
        }
      }
    }

    return { user: session.user, profile };
  },
  component: () => (
    <CallProvider>
      <Outlet />
    </CallProvider>
  ),
});
