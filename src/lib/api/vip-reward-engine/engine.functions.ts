import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { VipRewardEngineService } from "./engine.service";
import { writeVipAuditLog } from "./audit.functions";

const runSimulationValidator = z.object({
  month: z.number().min(1).max(12),
  year: z.number(),
  isSimulation: z.boolean().default(true),
});

/**
 * Server Function: runVipRewardSimulation
 * Allows Super Admins to run calculations in simulation/dry-run mode.
 */
export const runVipRewardSimulation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(runSimulationValidator)
  .handler(async ({ data, context }) => {
    try {
      // 1. Verify caller has super_admin role
      const { data: roleRows, error: rolesErr } = await context.supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId);
      
      if (rolesErr) throw new Error(rolesErr.message);
      
      const isSuperAdmin = (roleRows ?? []).some((r: any) => r.role === "super_admin");
      if (!isSuperAdmin) {
        throw new Error("Unauthorized: Super Admin access only.");
      }

      // Enforce simulation safety at the entrypoint wrapper
      if (!data.isSimulation) {
        throw new Error("Action Forbidden: Direct live updates are not allowed in this phase.");
      }

      // Write audit log for starting calculation
      await writeVipAuditLog(context.supabase, context.userId, "calculation_started", null, {
        month: data.month,
        year: data.year,
        isSimulation: data.isSimulation,
      });

      // 2. Instantiate and execute calculation orchestration
      const engine = new VipRewardEngineService();
      const result = await engine.runSimulation(context.supabase, {
        month: data.month,
        year: data.year,
        isSimulation: data.isSimulation,
      });

      if (result.status === "success") {
        await writeVipAuditLog(context.supabase, context.userId, "calculation_completed", null, {
          month: data.month,
          year: data.year,
          pool_size: result.pool_size,
          total_qualified_users: result.total_qualified_users,
          total_distributed_rewards: result.total_distributed_rewards,
        });
      } else {
        await writeVipAuditLog(context.supabase, context.userId, "calculation_failed", null, {
          month: data.month,
          year: data.year,
          error: result.error_message || "Calculation failed",
        });
      }

      return {
        success: result.status === "success",
        result,
      };

    } catch (e: any) {
      console.error("[runVipRewardSimulation Server Error]:", e.message);
      try {
        await writeVipAuditLog(context.supabase, context.userId, "calculation_failed", null, {
          month: data.month,
          year: data.year,
          error: e.message,
        });
      } catch (err) {
        console.error("Failed to write failure audit log:", err);
      }
      return {
        success: false,
        error: e.message || "An error occurred executing the calculation engine.",
      };
    }
  });
