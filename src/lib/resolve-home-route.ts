import { supabase } from "@/integrations/supabase/client";

/**
 * Resolve post-login home: admins → /app/admin, users → /app/chat.
 * Always reads role from DB so admins never bounce through user chats first.
 */
export async function resolveHomeRoute(userId: string): Promise<"/app/admin" | "/app/chat"> {
  let role = "user";
  try {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const list = (roles ?? []).map((r: any) => r.role as string);
    role = list.includes("super_admin")
      ? "super_admin"
      : list.includes("admin")
        ? "admin"
        : "user";
  } catch {
    const cached =
      typeof window !== "undefined" ? localStorage.getItem("jj_user_role") || "user" : "user";
    role = cached;
  }

  if (typeof window !== "undefined") {
    localStorage.setItem("jj_user_role", role);
  }

  return role === "admin" || role === "super_admin" ? "/app/admin" : "/app/chat";
}
