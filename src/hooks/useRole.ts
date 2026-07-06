import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "user" | "admin" | "super_admin";

export function useRole() {
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let lastUserId: string | null = null;
    let hasLoaded = false;

    async function load(userId: string | null, showLoading = false) {
      if (userId === lastUserId && hasLoaded) return;
      lastUserId = userId;
      hasLoaded = true;

      if (showLoading && mounted) setLoading(true);

      if (!userId) { 
        if (mounted) { 
          setRoles([]); 
          setLoading(false); 
        } 
        return; 
      }

      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (!mounted) return;
      setRoles((data ?? []).map((r) => r.role as AppRole));
      setLoading(false);
    }

    // Initial load
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) {
        load(session?.user?.id ?? null, true);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((e, session) => {
      if (e === "SIGNED_IN" || e === "SIGNED_OUT" || e === "USER_UPDATED") {
        if (mounted) {
          load(session?.user?.id ?? null, false);
        }
      }
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  const isSuperAdmin = roles.includes("super_admin");
  const isAdmin = roles.includes("admin") || isSuperAdmin;
  const topRole: AppRole = isSuperAdmin ? "super_admin" : isAdmin ? "admin" : "user";

  return { roles, isAdmin, isSuperAdmin, topRole, role: topRole, loading };
}
