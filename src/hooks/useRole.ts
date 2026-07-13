import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSharedInitialSession } from "@/lib/auth-wait";

export type AppRole = "user" | "admin" | "super_admin";

export function useRole() {
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
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
          setPermissions([]);
          setLoading(false); 
        } 
        return; 
      }

      const { data } = await supabase
        .from("user_roles")
        .select("role, permissions")
        .eq("user_id", userId);
      if (!mounted) return;
      setRoles((data ?? []).map((r) => r.role as AppRole));
      
      const permsSet = new Set<string>();
      (data ?? []).forEach((r: any) => {
        if (r.permissions) {
          r.permissions.forEach((p: string) => permsSet.add(p));
        }
      });
      setPermissions(Array.from(permsSet));

      setLoading(false);
    }

    // Re-use the shared initial session Promise to avoid a duplicate getSession()
    // network/storage read during cold boot.
    getSharedInitialSession().then((session) => {
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

  return { roles, isAdmin, isSuperAdmin, topRole, role: topRole, permissions, loading };
}
