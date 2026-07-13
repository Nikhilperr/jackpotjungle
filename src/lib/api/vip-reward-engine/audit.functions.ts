import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/wallet.functions";
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Backend-only Helper: writeVipAuditLog
 * Writes an append-only audit entry in the database.
 */
export async function writeVipAuditLog(
  supabase: SupabaseClient,
  userId: string,
  action: string,
  previousValue: any = null,
  newValue: any = null
) {
  try {
    // 1. Fetch profile to get username
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .maybeSingle();

    // 2. Fetch user role
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const username = profile?.username || "System Admin";
    const role = (roleRows ?? []).some((r: any) => r.role === "super_admin")
      ? "super_admin"
      : (roleRows ?? []).some((r: any) => r.role === "admin")
      ? "admin"
      : "user";

    // 3. Extract request context headers (IP & user-agent) via Vinxi event
    let userAgent = "";
    let ipAddress = "";
    try {
      const vinxiModuleName = "vinxi/http";
      const { getEvent } = await import(vinxiModuleName);
      const event = getEvent();
      if (event) {
        const req = event.node.req;
        userAgent = req.headers["user-agent"] || "";
        ipAddress = (req.headers["x-forwarded-for"] as string) || req.socket?.remoteAddress || "";
      }
    } catch {}

    const { error } = await supabase
      .from("vip_audit_logs")
      .insert({
        user_id: userId,
        username,
        role,
        action,
        previous_value: previousValue ? JSON.parse(JSON.stringify(previousValue)) : null,
        new_value: newValue ? JSON.parse(JSON.stringify(newValue)) : null,
        ip_address: ipAddress || null,
        device_info: userAgent || null,
      });

    if (error) {
      console.error("[writeVipAuditLog] DB Insert Error:", error.message);
    }
  } catch (err: any) {
    console.error("[writeVipAuditLog] Service Error:", err.message);
  }
}

const getAuditLogsValidator = z.object({
  action: z.string().optional(),
  username: z.string().optional(),
  role: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

/**
 * Server Function: getVipAuditLogs
 * Exposes a query interface for admins to search, filter, and fetch audit logs.
 */
export const getVipAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(getAuditLogsValidator)
  .handler(async ({ data, context }) => {
    try {
      await assertAdmin(context.supabase, context.userId);

      let query = context.supabase
        .from("vip_audit_logs")
        .select("*")
        .order("created_at", { ascending: false });

      if (data.action && data.action !== "all") {
        query = query.eq("action", data.action);
      }
      if (data.username && data.username.trim() !== "") {
        query = query.ilike("username", `%${data.username}%`);
      }
      if (data.role && data.role !== "all") {
        query = query.eq("role", data.role);
      }
      if (data.startDate) {
        query = query.gte("created_at", data.startDate);
      }
      if (data.endDate) {
        query = query.lte("created_at", data.endDate);
      }

      const { data: logs, error } = await query;
      if (error) throw new Error(error.message);

      return {
        success: true,
        logs: logs ?? [],
      };
    } catch (e: any) {
      console.error("[getVipAuditLogs Error]:", e.message);
      return { success: false, error: e.message };
    }
  });
