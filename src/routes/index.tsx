import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { waitInitialSession } from "@/lib/auth-wait";

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
      throw redirect({ to: "/reset-password" });
    }

    const session = await waitInitialSession();

    if (session?.user) {
      const uid = session.user.id;
      // Fetch user role to route them correctly
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      const isAdmin = !!roles?.some((r: any) => r.role === "admin" || r.role === "super_admin");
      throw redirect({ to: isAdmin ? "/admin" : "/chat" });
    } else {
      throw redirect({ to: "/auth" });
    }
  },
});
