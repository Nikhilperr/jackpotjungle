import { createFileRoute, redirect } from "@tanstack/react-router";
import { waitInitialSession } from "@/lib/auth-wait";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/")({
  ssr: false,
  beforeLoad: async () => {
    const session = await waitInitialSession();
    if (session?.user) {
      const uid = session.user.id;
      // Fetch user role to route them correctly
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      const isAdmin = !!roles?.some((r: any) => r.role === "admin" || r.role === "super_admin");
      throw redirect({ to: isAdmin ? "/app/admin" : "/app/chat" });
    } else {
      throw redirect({ to: "/app/auth" });
    }
  },
});
