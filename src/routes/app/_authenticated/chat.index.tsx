import { createFileRoute, redirect } from "@tanstack/react-router";
import { waitInitialSession } from "@/lib/auth-wait";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/_authenticated/chat/")({
  beforeLoad: async () => {
    const session = await waitInitialSession();
    if (session?.user) {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);
      const isAdmin = !!roles?.some((r: any) => r.role === "admin" || r.role === "super_admin");
      if (isAdmin) {
        throw redirect({ to: "/app/admin" });
      }
    }
  },
  component: () => null,
});

