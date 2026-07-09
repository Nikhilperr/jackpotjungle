import { createFileRoute, redirect } from "@tanstack/react-router";
import { waitInitialSession } from "@/lib/auth-wait";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/")({
  ssr: false,
  beforeLoad: async () => {
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
    } else {
      throw redirect({ to: "/app/auth" });
    }
  },
});
