import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "user" | "admin" | "super_admin";

export function useRole() {
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load(showLoading = false) {
      if (showLoading && mounted) setLoading(true);
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { if (mounted) { setRoles([]); setLoading(false); } return; }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id);
      if (!mounted) return;
      setRoles((data ?? []).map((r) => r.role as AppRole));
      setLoading(false);
    }
    load(true);
    const { data: sub } = supabase.auth.onAuthStateChange((e) => {
      if (e === "SIGNED_IN" || e === "SIGNED_OUT") load(true);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  const isSuperAdmin = roles.includes("super_admin");
  const isAdmin = roles.includes("admin") || isSuperAdmin;
  const topRole: AppRole = isSuperAdmin ? "super_admin" : isAdmin ? "admin" : "user";

  return { roles, isAdmin, isSuperAdmin, topRole, role: topRole, loading };
}
