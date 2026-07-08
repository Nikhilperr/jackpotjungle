import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "./wallet.functions";

export function calculateNextRun(frequency: string, timeOfDay: string): string {
  const [hour, minute] = timeOfDay.split(":").map(Number);
  const now = new Date();
  let next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);

  if (frequency === "friday_evening") {
    // Standardize Friday at 18:00 (6:00 PM)
    const currentDay = next.getDay();
    const daysToFriday = (5 - currentDay + 7) % 7;
    next.setDate(next.getDate() + daysToFriday);
    next.setHours(18, 0, 0, 0);
    if (next <= now) {
      next.setDate(next.getDate() + 7);
    }
    return next.toISOString();
  }

  if (next <= now) {
    if (frequency === "daily") {
      next.setDate(next.getDate() + 1);
    } else if (frequency === "weekly") {
      next.setDate(next.getDate() + 7);
    } else if (frequency === "monthly") {
      next.setMonth(next.getMonth() + 1);
    }
  }
  return next.toISOString();
}

// Fetch structured database report content
export const fetchReportData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    reportType: "revenue" | "deposit" | "withdrawal" | "support" | "broadcast" | "promotion" | "user_growth" | "vip" | "general";
    startDate?: string;
    endDate?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const start = data.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const end = data.endDate || new Date().toISOString();

    let resultData: any = {};

    switch (data.reportType) {
      case "revenue":
      case "deposit":
      case "withdrawal": {
        let query = supabaseAdmin
          .from("wallet_transactions")
          .select("*, profiles:user_id(username, first_name, last_name)")
          .eq("deleted", false)
          .gte("created_at", start)
          .lte("created_at", end);

        if (data.reportType === "deposit") {
          query = query.eq("action", "cashin");
        } else if (data.reportType === "withdrawal") {
          query = query.eq("action", "cashout");
        } else {
          query = query.in("action", ["cashin", "cashout"]);
        }

        const { data: txs, error } = await query.order("created_at", { ascending: false });
        if (error) throw new Error(error.message);

        let cashInTotal = 0;
        let cashOutTotal = 0;

        const formatted = (txs ?? []).map((t: any) => {
          const amt = Number(t.amount || 0);
          if (t.action === "cashin") cashInTotal += amt;
          else if (t.action === "cashout") cashOutTotal += amt;

          return {
            id: t.id,
            created_at: t.created_at,
            action: t.action.toUpperCase(),
            amount: amt,
            reason: t.reason || "Manual",
            username: t.profiles?.username || "Unknown",
            admin_name: t.admin_name || "Admin",
            notes: t.notes || "",
          };
        });

        resultData = {
          transactions: formatted,
          cashInTotal,
          cashOutTotal,
          netProfit: cashInTotal - cashOutTotal,
        };
        break;
      }

      case "vip": {
        const { data: players, error } = await supabaseAdmin
          .from("profiles")
          .select("id, username, first_name, last_name, vip_status, wallet_balance, credit_balance, wallet_deposits")
          .neq("vip_status", "none");

        if (error) throw new Error(error.message);

        const summaries = (players ?? []).map((p: any) => ({
          userId: p.id,
          username: p.username,
          displayName: `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.username,
          vipStatus: p.vip_status.toUpperCase(),
          walletBalance: Number(p.wallet_balance || 0),
          creditBalance: Number(p.credit_balance || 0),
          totalDeposits: Number(p.wallet_deposits || 0),
        })).sort((a, b) => b.walletBalance - a.walletBalance);

        resultData = { players: summaries };
        break;
      }

      case "support": {
        const { data: convs, error: cErr } = await supabaseAdmin
          .from("page_conversations")
          .select("id, created_at, is_spam");
        if (cErr) throw new Error(cErr.message);

        const { data: msgs, error: mErr } = await supabaseAdmin
          .from("page_messages")
          .select("id, created_at, from_page")
          .gte("created_at", start)
          .lte("created_at", end);
        if (mErr) throw new Error(mErr.message);

        const totalChats = convs?.length || 0;
        const spamChats = convs?.filter((c: any) => c.is_spam).length || 0;
        const totalMessages = msgs?.length || 0;
        const agentMessages = msgs?.filter((m: any) => m.from_page).length || 0;

        resultData = {
          totalChats,
          activeSupportRequests: totalChats - spamChats,
          spamChats,
          totalMessagesInPeriod: totalMessages,
          agentMessages,
          playerMessages: totalMessages - agentMessages,
        };
        break;
      }

      case "broadcast": {
        const { data: casts, error } = await supabaseAdmin
          .from("broadcasts")
          .select("*")
          .gte("created_at", start)
          .lte("created_at", end)
          .order("created_at", { ascending: false });
        if (error) throw new Error(error.message);

        resultData = {
          broadcasts: (casts ?? []).map((c: any) => ({
            id: c.id,
            created_at: c.created_at,
            content: c.content,
            target_type: c.target_type.toUpperCase(),
            sent_count: c.sent_count,
          })),
        };
        break;
      }

      case "user_growth": {
        const { data: users, error } = await supabaseAdmin
          .from("profiles")
          .select("created_at")
          .gte("created_at", start)
          .lte("created_at", end);
        if (error) throw new Error(error.message);

        const grouped: Record<string, number> = {};
        (users ?? []).forEach((u: any) => {
          const date = u.created_at.split("T")[0];
          grouped[date] = (grouped[date] || 0) + 1;
        });

        const timeline = Object.entries(grouped)
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => a.date.localeCompare(b.date));

        resultData = {
          totalRegistrations: users?.length || 0,
          timeline,
        };
        break;
      }

      case "general":
      default: {
        const [rev, vip, support, growth] = await Promise.all([
          fetchReportData({ data: { reportType: "revenue", startDate: start, endDate: end } }),
          fetchReportData({ data: { reportType: "vip", startDate: start, endDate: end } }),
          fetchReportData({ data: { reportType: "support", startDate: start, endDate: end } }),
          fetchReportData({ data: { reportType: "user_growth", startDate: start, endDate: end } }),
        ]);

        resultData = {
          revenue: rev,
          vip: vip,
          support: support,
          growth: growth,
        };
        break;
      }
    }

    return resultData;
  });

// Create scheduled report cron entry
export const createScheduledReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    reportType: string;
    frequency: string;
    timeOfDay?: string;
    email?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const timeOfDay = data.timeOfDay || "09:00";
    const nextRun = calculateNextRun(data.frequency, timeOfDay);

    const { data: inserted, error } = await supabaseAdmin
      .from("scheduled_reports")
      .insert({
        admin_id: context.userId,
        report_type: data.reportType,
        frequency: data.frequency,
        time_of_day: timeOfDay,
        next_run_at: nextRun,
        delivery_email: data.email || null,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return inserted;
  });
