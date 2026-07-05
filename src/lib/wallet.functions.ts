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
export const getWalletDetailsAdmin = createServerFn({ method: "POST" })
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
export const getWalletHistoryAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { targetUserId: string; filter?: string; startDate?: string; endDate?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("wallet_transactions")
      .select("*")
      .eq("user_id", data.targetUserId);

    if (data.filter && data.filter !== "all") {
      if (data.filter === "credit") {
        query = query.in("action", ["credit_added", "deduct_credit", "credit_released", "transfer"]);
      } else if (data.filter === "wallet") {
        query = query.in("action", ["deposit", "deduction", "credit_released", "refund", "bonus", "transfer", "correction", "reset"]);
      } else {
        query = query.eq("action", data.filter);
      }
    }

    if (data.startDate) {
      query = query.gte("created_at", data.startDate);
    }
    if (data.endDate) {
      // Add 23:59:59 to capture the whole end date if just a date string is passed
      const end = data.endDate.includes("T") ? data.endDate : `${data.endDate}T23:59:59.999Z`;
      query = query.lte("created_at", end);
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
    action: "deposit" | "credit_added" | "credit_released" | "deduction" | "deduct_credit" | "correction" | "refund" | "bonus" | "transfer" | "reset" | "cashin" | "cashout";
    amount: number;
    reason?: string;
    notes?: string;
    ipAddress?: string;
  }) => {
    if (d.amount < 0 && d.action !== "reset") throw new Error("Amount must be non-negative.");
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
    let chatText = "";
    const activeReason = data.reason || "Manual adjustment";
    const paymentMethod = activeReason.replace(" Credit Load", "").replace(" Load", "");

    switch (data.action) {
      case "deposit":
        nextAvail = prevAvail + amt;
        nextDeposits = prevDeposits + amt;
        notificationText = `You received $${amt.toFixed(2)} into your Available Balance (via ${activeReason}).`;
        chatText = `Wallet Updated: You received $${amt.toFixed(2)} into your wallet balance via ${paymentMethod}.`;
        break;

      case "credit_added":
        nextCredit = prevCredit + amt;
        notificationText = `$${amt.toFixed(2)} was added into your Credit Balance (via ${activeReason}).`;
        chatText = `Wallet Updated: $${amt.toFixed(2)} was added into your Credit Balance.`;
        break;

      case "credit_released":
        if (prevCredit < amt) throw new Error("Insufficient credit balance to release.");
        nextCredit = prevCredit - amt;
        nextAvail = prevAvail + amt;
        nextReleased = prevReleased + amt;
        notificationText = `$${amt.toFixed(2)} was released from your Credit Balance.`;
        chatText = `Wallet Updated: $${amt.toFixed(2)} was released from your Credit Balance.`;
        break;

      case "deduction":
        if (prevAvail < amt) throw new Error("Insufficient available balance for deduction.");
        nextAvail = prevAvail - amt;
        nextUsed = prevUsed + amt;
        notificationText = activeReason === "Played Funds"
          ? `You played $${amt.toFixed(2)} from your Available Balance.`
          : `$${amt.toFixed(2)} was deducted by an administrator.`;
        chatText = `Wallet Updated: $${amt.toFixed(2)} has been played by you and has been deducted from your wallet balance.`;
        break;

      case "deduct_credit":
        if (prevCredit < amt) throw new Error("Insufficient credit balance for deduction.");
        nextCredit = prevCredit - amt;
        notificationText = activeReason === "Played Funds"
          ? `You played $${amt.toFixed(2)} from your Credit Balance.`
          : `$${amt.toFixed(2)} was deducted from your Credit Balance.`;
        chatText = `Wallet Updated: $${amt.toFixed(2)} has been played by you and has been deducted from your Credit Balance via ${paymentMethod}.`;
        break;

      case "correction":
        // Correction can modify both or either, let's treat correction as adjusting Available Balance
        nextAvail = prevAvail + amt; // can pass negative amounts in server-code if adjusting downward, but here we require non-negative amount and reason
        notificationText = `Your wallet balance was corrected by $${amt.toFixed(2)}.`;
        chatText = `Wallet Updated: Your wallet balance was corrected by $${amt.toFixed(2)}.`;
        break;

      case "refund":
        nextAvail = prevAvail + amt;
        notificationText = `A refund of $${amt.toFixed(2)} was credited to your Available Balance.`;
        chatText = `Wallet Updated: A refund of $${amt.toFixed(2)} was credited to your Available Balance.`;
        break;

      case "bonus":
        nextAvail = prevAvail + amt;
        notificationText = `You received a bonus of $${amt.toFixed(2)} into your Available Balance.`;
        chatText = `Wallet Updated: You received a bonus of $${amt.toFixed(2)} into your Available Balance.`;
        break;

      case "transfer":
        // Transfer Available -> Credit
        if (prevAvail < amt) throw new Error("Insufficient available balance to transfer.");
        nextAvail = prevAvail - amt;
        nextCredit = prevCredit + amt;
        notificationText = `Transferred $${amt.toFixed(2)} from Available Balance to Credit Balance.`;
        chatText = `Wallet Updated: Transferred $${amt.toFixed(2)} from Available Balance to Credit Balance.`;
        break;

      case "reset":
        if (!isSuperAdmin) throw new Error("Only super admins can reset wallets.");
        nextAvail = 0;
        nextCredit = 0;
        nextDeposits = 0;
        nextReleased = 0;
        nextUsed = 0;
        notificationText = "Your wallet credit balances were reset by a super administrator.";
        chatText = `Wallet Updated: Your wallet credit balances were reset by a super administrator.`;
        break;

      case "cashin":
        nextAvail = prevAvail;
        nextCredit = prevCredit;
        nextDeposits = prevDeposits;
        nextReleased = prevReleased;
        nextUsed = prevUsed;
        notificationText = "";
        chatText = "";
        break;

      case "cashout":
        nextAvail = prevAvail;
        nextCredit = prevCredit;
        nextDeposits = prevDeposits;
        nextReleased = prevReleased;
        nextUsed = prevUsed;
        notificationText = "";
        chatText = "";
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
    if (notificationText) {
      await supabaseAdmin
        .from("user_notifications")
        .insert({
          user_id: data.targetUserId,
          title: "Wallet Credit Update",
          content: notificationText,
        });
    }

    // 4. Send chat message warning/update to the support page chat
    if (chatText) {
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
            content: chatText,
          });
        }
      } catch (chatErr) {
        console.warn("Failed to notify user in chat:", chatErr);
      }
    }

    // VIP Upgrade logic on cashin
    if (data.action === "cashin") {
      try {
        const { data: cashins, error: cashinsErr } = await supabaseAdmin
          .from("wallet_transactions")
          .select("amount")
          .eq("user_id", data.targetUserId)
          .eq("action", "cashin");

        if (!cashinsErr && cashins) {
          const totalCashIn = cashins.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

          const { data: prof, error: profErr } = await supabaseAdmin
            .from("profiles")
            .select("vip_status, wallet_balance, wallet_deposits")
            .eq("id", data.targetUserId)
            .maybeSingle();

          if (!profErr && prof) {
            const currentVip = (prof.vip_status || "none").toLowerCase();

            const ranks: Record<string, number> = {
              none: 0,
              bronze: 1,
              silver: 2,
              gold: 3,
              platinum: 4,
              diamond: 5
            };

            const currentRank = ranks[currentVip] ?? 0;

            let qualifiedVip = "none";
            let bonusAmount = 0;

            if (totalCashIn >= 5000) {
              qualifiedVip = "diamond";
              bonusAmount = 100;
            } else if (totalCashIn >= 1000) {
              qualifiedVip = "platinum";
              bonusAmount = 75;
            } else if (totalCashIn >= 500) {
              qualifiedVip = "gold";
              bonusAmount = 40;
            } else if (totalCashIn >= 250) {
              qualifiedVip = "silver";
              bonusAmount = 10;
            } else if (totalCashIn >= 100) {
              qualifiedVip = "bronze";
              bonusAmount = 5;
            }

            const qualifiedRank = ranks[qualifiedVip] ?? 0;

            if (qualifiedRank > currentRank) {
              const prevBalance = Number(prof.wallet_balance || 0);
              const newAvail = prevBalance + bonusAmount;
              const newDeposits = Number(prof.wallet_deposits || 0) + bonusAmount;

              // 1. Update user profile to the new vip_status and credit available balance
              const { error: vipUpdateErr } = await supabaseAdmin
                .from("profiles")
                .update({
                  vip_status: qualifiedVip,
                  wallet_balance: newAvail,
                  wallet_deposits: newDeposits,
                  wallet_last_updated: new Date().toISOString()
                } as any)
                .eq("id", data.targetUserId);

              if (!vipUpdateErr) {
                // 2. Insert wallet transaction for cashback deposit
                await supabaseAdmin
                  .from("wallet_transactions")
                  .insert({
                    user_id: data.targetUserId,
                    admin_id: context.userId,
                    admin_name: "System",
                    action: "deposit",
                    amount: bonusAmount,
                    avail_before: prevBalance,
                    avail_after: newAvail,
                    credit_before: 0,
                    credit_after: 0,
                    reason: `VIP Upgrade Cashback - ${qualifiedVip.toUpperCase()}`,
                    notes: `Automatically awarded for reaching ${qualifiedVip.toUpperCase()} VIP level.`,
                  });

                // 3. Send automated system message to their support chat
                const { data: conv } = await supabaseAdmin
                  .from("page_conversations")
                  .select("id")
                  .eq("user_id", data.targetUserId)
                  .maybeSingle();

                if (conv) {
                  const messageText = `your level upgraded to ${qualifiedVip} you got ${bonusAmount}$ cashback for reaching ${qualifiedVip} its as deposit you can cashout or play it`;
                  await supabaseAdmin.from("page_messages").insert({
                    conversation_id: conv.id,
                    sender_id: context.userId,
                    from_page: true,
                    content: messageText,
                  });
                }
              }
            }
          }
        }
      } catch (err) {
        console.error("Failed to run VIP upgrade checks:", err);
      }
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
    startDate?: string;
    endDate?: string;
    totalDeposited?: number;
    totalReleased?: number;
    totalUsed?: number;
    ledgerFilter?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Fetch user details
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("username, email, first_name, last_name, wallet_balance, credit_balance")
      .eq("id", data.targetUserId)
      .maybeSingle();

    if (!profile) throw new Error("Target user not found.");

    const customerName = profile.first_name
      ? `${profile.first_name} ${profile.last_name || ""}`.trim()
      : profile.username;

    const dateRangeStr = (data.startDate || data.endDate)
      ? `${data.startDate || "Beginning"} to ${data.endDate || "Present"}`
      : "All Time";

    const dep = data.totalDeposited !== undefined ? data.totalDeposited : 0;
    const rel = data.totalReleased !== undefined ? data.totalReleased : 0;
    const usd = data.totalUsed !== undefined ? data.totalUsed : 0;

    const showWallet = !data.ledgerFilter || data.ledgerFilter === "all" || data.ledgerFilter === "wallet";
    const showCredit = !data.ledgerFilter || data.ledgerFilter === "all" || data.ledgerFilter === "credit";

    let balanceLines = "";
    if (showWallet) balanceLines += `Available Balance: $${Number(profile.wallet_balance ?? 0).toFixed(2)}\n`;
    if (showCredit) balanceLines += `Credit Balance: $${Number(profile.credit_balance ?? 0).toFixed(2)}\n`;
    balanceLines = balanceLines.trim();

    let summaryLines = "";
    if (showWallet) {
      summaryLines += `• Total Deposits: $${Number(dep).toFixed(2)}\n`;
    }
    if (showCredit) {
      summaryLines += `• Total Released: $${Number(rel).toFixed(2)}\n`;
    }
    if (showWallet) {
      summaryLines += `• Total Played (Spent): $${Number(usd).toFixed(2)}\n`;
    } else if (showCredit) {
      summaryLines += `• Total Credit Spent: $${Number(usd).toFixed(2)}\n`;
    }
    summaryLines = summaryLines.trim();

    const typeStr = data.ledgerFilter ? data.ledgerFilter.toUpperCase() : "ALL";

    const statementSummary = `
📄 JACKPOT JUNGLE STATEMENT (${typeStr})

Customer: ${customerName}
Date Range: ${dateRangeStr}

${balanceLines}

--- Period Summary ---
${summaryLines}

Generated: ${new Date().toLocaleString()}
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
        content: statementSummary,
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
      .eq("deleted", false)
      .neq("action", "cashin")
      .neq("action", "cashout")
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
      .eq("deleted", false)
      .neq("action", "cashin")
      .neq("action", "cashout")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return txs ?? [];
  });

// Edit a past transaction with balance updates & audit log adjustments
export const editWalletTransactionAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    transactionId: string;
    newAmount: number;
    newReason: string;
    newNotes?: string;
    newCreatedAt: string;
  }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Fetch original transaction
    const { data: tx, error: txError } = await supabaseAdmin
      .from("wallet_transactions")
      .select("*")
      .eq("id", data.transactionId)
      .maybeSingle();

    if (txError) throw new Error(txError.message);
    if (!tx) throw new Error("Transaction not found.");
    if (tx.deleted) throw new Error("Cannot edit a deleted transaction.");

    // 2. Fetch user profile
    const { data: profile, error: profError } = await supabaseAdmin
      .from("profiles")
      .select("wallet_balance, credit_balance")
      .eq("id", tx.user_id)
      .maybeSingle();

    if (profError) throw new Error(profError.message);
    if (!profile) throw new Error("User profile not found.");

    const originalAmount = Number(tx.amount);
    const newAmount = Number(data.newAmount);
    const diff = newAmount - originalAmount;

    let nextAvail = Number(profile.wallet_balance ?? 0);
    let nextCredit = Number(profile.credit_balance ?? 0);

    // Recalculate balance based on action type
    if (tx.action === "deposit" || tx.action === "refund" || tx.action === "bonus") {
      nextAvail = Math.max(0, nextAvail + diff);
    } else if (tx.action === "deduction") {
      nextAvail = Math.max(0, nextAvail - diff);
    } else if (tx.action === "credit_added") {
      nextCredit = Math.max(0, nextCredit + diff);
    } else if (tx.action === "deduct_credit") {
      nextCredit = Math.max(0, nextCredit - diff);
    } else if (tx.action === "credit_released") {
      nextCredit = Math.max(0, nextCredit - diff);
      nextAvail = Math.max(0, nextAvail + diff);
    }

    // 3. Update the transaction with audit details
    const originalAmountSaved = tx.original_amount !== null ? Number(tx.original_amount) : originalAmount;
    const { error: updateTxErr } = await supabaseAdmin
      .from("wallet_transactions")
      .update({
        amount: newAmount,
        reason: data.newReason,
        notes: data.newNotes || tx.notes,
        created_at: data.newCreatedAt,
        edited: true,
        original_amount: originalAmountSaved,
        edited_at: new Date().toISOString(),
      } as any)
      .eq("id", tx.id);

    if (updateTxErr) throw new Error(updateTxErr.message);

    // 4. Update the user profile balance
    const { error: updateProfErr } = await supabaseAdmin
      .from("profiles")
      .update({
        wallet_balance: nextAvail,
        credit_balance: nextCredit,
        wallet_last_updated: new Date().toISOString()
      } as any)
      .eq("id", tx.user_id);

    if (updateProfErr) throw new Error(updateProfErr.message);

    return {
      success: true,
      wallet_balance: nextAvail,
      credit_balance: nextCredit,
      userId: tx.user_id
    };
  });

// Soft-delete a transaction and revert its balance impact
export const deleteWalletTransactionAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { transactionId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Fetch original transaction
    const { data: tx, error: txError } = await supabaseAdmin
      .from("wallet_transactions")
      .select("*")
      .eq("id", data.transactionId)
      .maybeSingle();

    if (txError) throw new Error(txError.message);
    if (!tx) throw new Error("Transaction not found.");
    if (tx.deleted) throw new Error("Transaction is already deleted.");

    // 2. Fetch user profile
    const { data: profile, error: profError } = await supabaseAdmin
      .from("profiles")
      .select("wallet_balance, credit_balance")
      .eq("id", tx.user_id)
      .maybeSingle();

    if (profError) throw new Error(profError.message);
    if (!profile) throw new Error("User profile not found.");

    const amount = Number(tx.amount);
    let nextAvail = Number(profile.wallet_balance ?? 0);
    let nextCredit = Number(profile.credit_balance ?? 0);

    // Revert balance impact
    if (tx.action === "deposit" || tx.action === "refund" || tx.action === "bonus") {
      nextAvail = Math.max(0, nextAvail - amount);
    } else if (tx.action === "deduction") {
      nextAvail = Math.max(0, nextAvail + amount);
    } else if (tx.action === "credit_added") {
      nextCredit = Math.max(0, nextCredit - amount);
    } else if (tx.action === "deduct_credit") {
      nextCredit = Math.max(0, nextCredit + amount);
    } else if (tx.action === "credit_released") {
      nextCredit = Math.max(0, nextCredit + amount);
      nextAvail = Math.max(0, nextAvail - amount);
    }

    // 3. Hard-delete transaction from the database
    const { error: deleteTxErr } = await supabaseAdmin
      .from("wallet_transactions")
      .delete()
      .eq("id", tx.id);

    if (deleteTxErr) throw new Error(deleteTxErr.message);

    // 4. Update the user profile balance
    const { error: updateProfErr } = await supabaseAdmin
      .from("profiles")
      .update({
        wallet_balance: nextAvail,
        credit_balance: nextCredit,
        wallet_last_updated: new Date().toISOString()
      } as any)
      .eq("id", tx.user_id);

    if (updateProfErr) throw new Error(updateProfErr.message);

    return {
      success: true,
      wallet_balance: nextAvail,
      credit_balance: nextCredit,
      userId: tx.user_id
    };
  });

// Generate dynamic administrative cash flow profit reports
export const getProfitReportAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { targetUserId?: string; startDate?: string; endDate?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("wallet_transactions")
      .select("*, profiles:user_id(username, first_name, last_name)")
      .eq("deleted", false)
      .in("action", ["cashin", "cashout"]);

    if (data.targetUserId) {
      query = query.eq("user_id", data.targetUserId);
    }
    if (data.startDate) {
      query = query.gte("created_at", data.startDate);
    }
    if (data.endDate) {
      query = query.lte("created_at", data.endDate);
    }

    const { data: txs, error } = await query.order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Calculate totals
    let totalCashIn = 0;
    let totalCashOut = 0;

    // Group by user
    const userSummaryMap: Record<string, { userId: string; username: string; first_name: string; last_name: string; cashIn: number; cashOut: number; net: number }> = {};

    const formattedTxs = (txs ?? []).map((tx: any) => {
      const amt = Number(tx.amount || 0);
      const isCashIn = tx.action === "cashin";
      
      if (isCashIn) {
        totalCashIn += amt;
      } else {
        totalCashOut += amt;
      }

      const profile = tx.profiles;
      const username = profile?.username || "Unknown";
      const first_name = profile?.first_name || "";
      const last_name = profile?.last_name || "";

      if (tx.user_id) {
        if (!userSummaryMap[tx.user_id]) {
          userSummaryMap[tx.user_id] = {
            userId: tx.user_id,
            username,
            first_name,
            last_name,
            cashIn: 0,
            cashOut: 0,
            net: 0,
          };
        }
        if (isCashIn) {
          userSummaryMap[tx.user_id].cashIn += amt;
        } else {
          userSummaryMap[tx.user_id].cashOut += amt;
        }
        userSummaryMap[tx.user_id].net = userSummaryMap[tx.user_id].cashIn - userSummaryMap[tx.user_id].cashOut;
      }

      return {
        id: tx.id,
        created_at: tx.created_at,
        action: tx.action,
        amount: amt,
        reason: tx.reason,
        notes: tx.notes,
        admin_name: tx.admin_name,
        username,
        user_id: tx.user_id,
      };
    });

    const userSummaries = Object.values(userSummaryMap).sort((a, b) => b.net - a.net);

    return {
      transactions: formattedTxs,
      userSummaries,
      totalCashIn,
      totalCashOut,
      netProfit: totalCashIn - totalCashOut,
    };
  });

