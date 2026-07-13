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

      let roleData: any[] | null = null;
      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role, permissions")
          .eq("user_id", userId);
        
        if (error) {
          console.warn("useRole permissions query error (might not exist yet):", error);
          if (error.code === "42703" || error.message?.includes("permissions")) {
            // Column permissions does not exist yet (migration pending), query only role
            const fallback = await supabase
              .from("user_roles")
              .select("role")
              .eq("user_id", userId);
            if (fallback.error) {
              console.error("useRole fallback query failed:", fallback.error);
            } else {
              roleData = fallback.data;
            }
          }
        } else {
          roleData = data;
        }
      } catch (err) {
        console.error("Exception fetching user roles:", err);
      }

      if (!mounted) return;
      
      const parsedRoles = (roleData ?? []).map((r: any) => r.role as AppRole);
      setRoles(parsedRoles);
      
      const permsSet = new Set<string>();
      (roleData ?? []).forEach((r: any) => {
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
