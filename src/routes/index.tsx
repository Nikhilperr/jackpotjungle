import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { waitInitialSession } from "@/lib/auth-wait";
import { LandingContainer } from "@/components/landing/LandingContainer";
import { Capacitor } from "@capacitor/core";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    // Detect if this is a password recovery redirect link
    const isRecovery = typeof window !== "undefined" && (
      window.location.hash.includes("type=recovery") ||
      window.location.search.includes("type=recovery") ||
      window.location.hash.includes("type=password_reset") ||
      window.location.search.includes("type=password_reset")
    );

    if (isRecovery) {
      throw redirect({ to: "/app/reset-password" });
    }

    const session = await waitInitialSession();

    if (session?.user) {
      const uid = session.user.id;
      
      // Try resolving role synchronously from local cache first to open instantly
      if (typeof window !== "undefined") {
        const cachedRole = localStorage.getItem("jj_user_role");
        if (cachedRole) {
          const isAdmin = cachedRole === "admin" || cachedRole === "super_admin";
          throw redirect({ to: isAdmin ? "/app/admin" : "/app/chat" });
        }
      }

      // Fetch user role from database if not cached
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      const userRole = roles?.[0]?.role || "user";
      if (typeof window !== "undefined") {
        localStorage.setItem("jj_user_role", userRole);
      }
      const isAdmin = userRole === "admin" || userRole === "super_admin";
      throw redirect({ to: isAdmin ? "/app/admin" : "/app/chat" });
    } else if (Capacitor.isNativePlatform()) {
      throw redirect({ to: "/app/auth" });
    }
  },
  component: LandingContainer,
});
