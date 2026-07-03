import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Assert caller is Admin or Super Admin
async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: any) => r.role);
  const isAdmin = roles.includes("admin") || roles.includes("super_admin");
  if (!isAdmin) throw new Error("Administrator access required.");
  return {
    isSuperAdmin: roles.includes("super_admin"),
  };
}

// Fetch wallet details for admin view
export const getWalletDetailsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { targetUserId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Fetch user details
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("wallet_balance, credit_balance, wallet_deposits, wallet_released, wallet_used, wallet_last_updated, username, first_name, last_name")
      .eq("id", data.targetUserId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!profile) throw new Error("Target user not found.");

    // Fetch recent 10 transactions
    const { data: txs, error: txError } = await supabaseAdmin
      .from("wallet_transactions")
      .select("*")
      .eq("user_id", data.targetUserId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (txError) throw new Error(txError.message);

    return {
      profile,
      transactions: txs ?? [],
    };
  });

// Fetch full wallet history for admin with filter options
export const getWalletHistoryAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { targetUserId: string; filter?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("wallet_transactions")
      .select("*")
      .eq("user_id", data.targetUserId);

    if (data.filter && data.filter !== "all") {
      query = query.eq("action", data.filter);
    }

    const { data: txs, error } = await query.order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    return txs ?? [];
  });

// Perform administrative wallet action
export const performWalletActionAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    targetUserId: string;
    action: "deposit" | "credit_added" | "credit_released" | "deduction" | "deduct_credit" | "correction" | "refund" | "bonus" | "transfer" | "reset";
    amount: number;
    reason: string;
    notes?: string;
    ipAddress?: string;
  }) => {
    if (d.amount < 0 && d.action !== "reset") throw new Error("Amount must be non-negative.");
    if (!d.reason && d.action !== "reset") throw new Error("Transaction reason is required.");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { isSuperAdmin } = await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Fetch caller display name
    const { data: adminProf } = await supabaseAdmin
      .from("profiles")
      .select("username, first_name, last_name")
      .eq("id", context.userId)
      .maybeSingle();
    const adminName = adminProf?.first_name 
      ? `${adminProf.first_name} ${adminProf.last_name || ""}`.trim()
      : adminProf?.username || "Administrator";

    // Fetch target user roles to verify they aren't a super admin
    const { data: targetRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.targetUserId);
    const targetRolesList = (targetRoles ?? []).map((r: any) => r.role);
    if (targetRolesList.includes("super_admin")) {
      throw new Error("Super admin accounts are read-only and cannot be modified.");
    }

    // Fetch target user profile
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("wallet_balance, credit_balance, wallet_deposits, wallet_released, wallet_used")
      .eq("id", data.targetUserId)
      .maybeSingle();

    if (!profile) throw new Error("Target user profile not found.");

    const prevAvail = Number(profile.wallet_balance ?? 0);
    const prevCredit = Number(profile.credit_balance ?? 0);
    const prevDeposits = Number(profile.wallet_deposits ?? 0);
    const prevReleased = Number(profile.wallet_released ?? 0);
    const prevUsed = Number(profile.wallet_used ?? 0);

    let nextAvail = prevAvail;
    let nextCredit = prevCredit;
    let nextDeposits = prevDeposits;
    let nextReleased = prevReleased;
    let nextUsed = prevUsed;

    const amt = Number(data.amount);
    let notificationText = "";

    switch (data.action) {
      case "deposit":
        nextAvail = prevAvail + amt;
        nextDeposits = prevDeposits + amt;
        notificationText = `You received $${amt.toFixed(2)} into your Available Balance.`;
        break;

      case "credit_added":
        nextCredit = prevCredit + amt;
        notificationText = `$${amt.toFixed(2)} was added into your Credit Balance.`;
        break;

      case "credit_released":
        if (prevCredit < amt) throw new Error("Insufficient credit balance to release.");
        nextCredit = prevCredit - amt;
        nextAvail = prevAvail + amt;
        nextReleased = prevReleased + amt;
        notificationText = `$${amt.toFixed(2)} was released from your Credit Balance.`;
        break;

      case "deduction":
        if (prevAvail < amt) throw new Error("Insufficient available balance for deduction.");
        nextAvail = prevAvail - amt;
        nextUsed = prevUsed + amt;
        notificationText = `$${amt.toFixed(2)} was deducted by an administrator.`;
        break;

      case "deduct_credit":
        if (prevCredit < amt) throw new Error("Insufficient credit balance for deduction.");
        nextCredit = prevCredit - amt;
        notificationText = `$${amt.toFixed(2)} was deducted from your Credit Balance.`;
        break;

      case "correction":
        // Correction can modify both or either, let's treat correction as adjusting Available Balance
        nextAvail = prevAvail + amt; // can pass negative amounts in server-code if adjusting downward, but here we require non-negative amount and reason
        notificationText = `Your wallet balance was corrected by $${amt.toFixed(2)}.`;
        break;

      case "refund":
        nextAvail = prevAvail + amt;
        notificationText = `A refund of $${amt.toFixed(2)} was credited to your Available Balance.`;
        break;

      case "bonus":
        nextAvail = prevAvail + amt;
        notificationText = `You received a bonus of $${amt.toFixed(2)} into your Available Balance.`;
        break;

      case "transfer":
        // Transfer Available -> Credit
        if (prevAvail < amt) throw new Error("Insufficient available balance to transfer.");
        nextAvail = prevAvail - amt;
        nextCredit = prevCredit + amt;
        notificationText = `Transferred $${amt.toFixed(2)} from Available Balance to Credit Balance.`;
        break;

      case "reset":
        if (!isSuperAdmin) throw new Error("Only super admins can reset wallets.");
        nextAvail = 0;
        nextCredit = 0;
        nextDeposits = 0;
        nextReleased = 0;
        nextUsed = 0;
        notificationText = "Your wallet credit balances were reset by a super administrator.";
        break;

      default:
        throw new Error("Invalid wallet action.");
    }

    // 1. Update profiles table
    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({
        wallet_balance: nextAvail,
        credit_balance: nextCredit,
        wallet_deposits: nextDeposits,
        wallet_released: nextReleased,
        wallet_used: nextUsed,
        wallet_last_updated: new Date().toISOString()
      } as any)
      .eq("id", data.targetUserId);

    if (updateError) throw new Error(updateError.message);

    // 2. Insert wallet transaction
    const { error: txError } = await supabaseAdmin
      .from("wallet_transactions")
      .insert({
        user_id: data.targetUserId,
        admin_id: context.userId,
        admin_name: adminName,
        action: data.action,
        amount: amt,
        avail_before: prevAvail,
        avail_after: nextAvail,
        credit_before: prevCredit,
        credit_after: nextCredit,
        reason: data.reason || "Wallet reset",
        notes: data.notes || null,
        ip_address: data.ipAddress || null,
      });

    if (txError) throw new Error(txError.message);

    // 3. Write in-app user notification
    await supabaseAdmin
      .from("user_notifications")
      .insert({
        user_id: data.targetUserId,
        title: "Wallet Credit Update",
        content: notificationText,
      });

    // 4. Send chat message warning/update to the support page chat
    try {
      const { data: conv } = await supabaseAdmin
        .from("page_conversations")
        .select("id")
        .eq("user_id", data.targetUserId)
        .maybeSingle();

      if (conv) {
        await supabaseAdmin.from("page_messages").insert({
          conversation_id: conv.id,
          sender_id: context.userId,
          from_page: true,
          content: `[Wallet Update] ${notificationText} Reason: ${data.reason}`,
        });
      }
    } catch (chatErr) {
      console.warn("Failed to notify user in chat:", chatErr);
    }

    return {
      success: true,
      wallet_balance: nextAvail,
      credit_balance: nextCredit,
    };
  });

// Send statement function (Email or Chat)
export const sendWalletStatementAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    targetUserId: string;
    method: "email" | "chat";
    openingBalance: number;
    closingBalance: number;
    transactions: any[];
  }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Fetch user details
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("username, email, first_name, last_name")
      .eq("id", data.targetUserId)
      .maybeSingle();

    if (!profile) throw new Error("Target user not found.");

    const customerName = profile.first_name 
      ? `${profile.first_name} ${profile.last_name || ""}`.trim()
      : profile.username;

    const statementSummary = `
--- WALLET FINANCIAL STATEMENT ---
Customer Name: ${customerName}
Opening Balance: $${Number(data.openingBalance).toFixed(2)}
Closing Balance: $${Number(data.closingBalance).toFixed(2)}
Total Transactions: ${data.transactions.length}
Generated On: ${new Date().toLocaleString()}
    `.trim();

    if (data.method === "chat") {
      const { data: conv } = await supabaseAdmin
        .from("page_conversations")
        .select("id")
        .eq("user_id", data.targetUserId)
        .maybeSingle();

      if (!conv) throw new Error("Active chat conversation not found.");

      await supabaseAdmin.from("page_messages").insert({
        conversation_id: conv.id,
        sender_id: context.userId,
        from_page: true,
        content: `[Statement Details]\n${statementSummary}`,
      });
    } else {
      // Mock email sending audit log
      console.log(`[Email Statement] Sent statement to ${profile.email || "No Email Specified"}:\n`, statementSummary);
    }

    return { success: true };
  });

// USER-SIDE APIs (authorized to fetch own data only)

export const getWalletDetailsUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile, error } = await context.supabase
      .from("profiles")
      .select("wallet_balance, credit_balance, wallet_deposits, wallet_released, wallet_used, wallet_last_updated")
      .eq("id", context.userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!profile) throw new Error("Profile not found.");

    const { data: txs } = await context.supabase
      .from("wallet_transactions")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(10);

    const { data: notifications } = await context.supabase
      .from("user_notifications")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(10);

    return {
      profile,
      transactions: txs ?? [],
      notifications: notifications ?? [],
    };
  });

export const getWalletHistoryUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: txs, error } = await context.supabase
      .from("wallet_transactions")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return txs ?? [];
  });
