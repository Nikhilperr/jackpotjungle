import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import crypto from "crypto";

const getAddressValidator = z.object({
  coin: z.string(),
  network: z.string(),
});

const verifyDepositValidator = z.object({
  coin: z.string().optional(),
});

// Helper: fetch current live crypto price in USDT
async function getCryptoPrice(coin: string): Promise<number> {
  const normalized = coin.toUpperCase();
  if (normalized === "USDT" || normalized === "BUSD" || normalized === "USDC") {
    return 1.0;
  }
  try {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${normalized}USDT`);
    if (res.ok) {
      const data = await res.json();
      return Number(data.price || 0);
    }
  } catch (e) {
    console.error(`Failed to fetch real-time price for ${coin}:`, e);
  }
  // Hardcoded fallback exchange rates if Binance is offline
  if (normalized === "BTC") return 90000;
  if (normalized === "ETH") return 3500;
  if (normalized === "BNB") return 600;
  if (normalized === "LTC") return 120;
  if (normalized === "SOL") return 180;
  return 1.0;
}

// Helper: map network code from UI to Cryptomus network code
function mapNetworkToCryptomus(coin: string, network: string): string {
  const c = coin.toUpperCase();
  const n = network.toUpperCase();
  if (n === "TRX") return "tron";
  if (n === "BSC") return "bsc";
  if (n === "ETH") return "eth";
  if (n === "BTC") return "btc";
  if (n === "LTC") return "ltc";
  if (n === "SOL") return "sol";
  return network.toLowerCase();
}

/**
 * Fetch/Generate unique deposit address for a specific cryptocurrency and network via Cryptomus
 */
export const getDepositAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(getAddressValidator)
  .handler(async ({ data, context }) => {
    const { coin, network } = data;
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const merchantId = process.env.CRYPTOMUS_MERCHANT_ID;
    const apiKey = process.env.CRYPTOMUS_API_KEY;

    if (!merchantId || !apiKey) {
      return { 
        success: false, 
        error: "Cryptomus payment gateway keys are not configured on the server .env file yet. Please complete your project verification." 
      };
    }

    try {
      // 1. Check if we already cached this address in database
      const { data: cached } = await supabaseAdmin
        .from("user_deposit_addresses")
        .select("address, tag")
        .eq("user_id", userId)
        .eq("coin", coin.toUpperCase())
        .eq("network", network.toUpperCase())
        .maybeSingle();

      if (cached) {
        return { success: true, address: cached.address, tag: cached.tag, isFallback: false };
      }

      // 2. Request a static wallet address from Cryptomus
      const orderId = `${userId}_${coin.toUpperCase()}_${network.toUpperCase()}`;
      const cryptomusNetwork = mapNetworkToCryptomus(coin, network);

      const payload = {
        currency: coin.toUpperCase(),
        network: cryptomusNetwork,
        order_id: orderId,
        url_callback: `https://chat.playjackpotjungle.com/api/cryptomus-webhook`
      };

      const jsonStr = JSON.stringify(payload);
      const base64Str = Buffer.from(jsonStr).toString("base64");
      const sign = crypto.createHash("md5").update(base64Str + apiKey).digest("hex");

      const response = await fetch("https://api.cryptomus.com/v1/wallet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "merchant": merchantId,
          "sign": sign
        },
        body: jsonStr
      });

      const responseData = await response.json();
      
      if (responseData.state === 0 && responseData.result) {
        const address = responseData.result.address;
        const tag = responseData.result.address_terminal || null;

        // Cache the retrieved address in the database
        await supabaseAdmin.from("user_deposit_addresses").insert({
          user_id: userId,
          coin: coin.toUpperCase(),
          network: network.toUpperCase(),
          address: address,
          tag: tag
        });

        return {
          success: true,
          address: address,
          tag: tag,
          isFallback: false
        };
      } else {
        console.error("[Cryptomus API Error] getDepositAddress failed:", responseData);
        throw new Error(responseData.message || "Failed to generate wallet from Cryptomus API.");
      }
    } catch (e: any) {
      console.error("[Deposit Service] getDepositAddress failure:", e);
      return { success: false, error: e.message };
    }
  });

/**
 * Query Cryptomus payment history, checking and crediting new cashin events
 */
export const verifyDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(verifyDepositValidator)
  .handler(async ({ context }) => {
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const merchantId = process.env.CRYPTOMUS_MERCHANT_ID;
    const apiKey = process.env.CRYPTOMUS_API_KEY;

    if (!merchantId || !apiKey) {
      return { success: true, credited: 0, message: "Cryptomus API keys are not configured yet." };
    }

    try {
      // 1. Fetch recent payment list from Cryptomus
      const payload = {};
      const jsonStr = JSON.stringify(payload);
      const base64Str = Buffer.from(jsonStr).toString("base64");
      const sign = crypto.createHash("md5").update(base64Str + apiKey).digest("hex");

      const response = await fetch("https://api.cryptomus.com/v1/payment/list", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "merchant": merchantId,
          "sign": sign
        },
        body: jsonStr
      });

      const responseData = await response.json();

      if (responseData.state !== 0 || !responseData.result || !Array.isArray(responseData.result.items)) {
        return { success: true, credited: 0, message: "No payments recorded yet." };
      }

      const history = responseData.result.items;
      let totalCreditedUSD = 0;
      const creditedTransactions = [];
      const userPrefix = `${userId}_`;

      // 2. Fetch all cached deposits for this user to check duplicates
      const { data: matchedDeps } = await supabaseAdmin
        .from("crypto_deposits")
        .select("id, status, wallet_credited, txid")
        .eq("user_id", userId);

      for (const dep of history) {
        // Filter by user ID order_id prefix
        if (!dep.order_id || !dep.order_id.startsWith(userPrefix)) {
          continue;
        }

        const txId = dep.txid || dep.uuid;
        const coin = dep.currency || "USDT";
        const network = dep.network ? dep.network.toUpperCase() : "UNKNOWN";
        const address = dep.address || "UNKNOWN";
        const cryptoAmount = Number(dep.amount);
        const cryptomusStatus = dep.status; // paid, paid_over, wrong_amount, process, confirm_check, etc.
        const depositTime = dep.created_at ? new Date(dep.created_at).toISOString() : new Date().toISOString();

        if (!txId) continue;

        // Check if we already audited this transaction
        let cachedDep = null;
        if (matchedDeps) {
          cachedDep = matchedDeps.find(d => 
            (dep.txid && d.txid === dep.txid) || 
            (d.txid === dep.uuid) || 
            (d.txid === dep.order_id)
          );
        }

        // Calculate USD value using exchange rates
        const coinPrice = await getCryptoPrice(coin);
        const usdValue = Number((cryptoAmount * coinPrice).toFixed(2));

        const isSuccess = ["paid", "paid_over", "wrong_amount"].includes(cryptomusStatus);
        const isPending = ["process", "confirm_check"].includes(cryptomusStatus);

        if (isSuccess) {
          let shouldCredit = false;

          if (!cachedDep) {
            shouldCredit = true;
          } else if (cachedDep.status !== "completed" && !cachedDep.wallet_credited) {
            shouldCredit = true;
          }

          // Double check wallet_ledger to ensure 100% duplicate protection
          if (shouldCredit) {
            const { data: existingTx } = await supabaseAdmin
              .from("wallet_transactions")
              .select("id")
              .eq("external_id", txId)
              .maybeSingle();
            if (existingTx) {
              shouldCredit = false;
            }
          }

          if (shouldCredit && usdValue > 0) {
            const { data: profile } = await supabaseAdmin
              .from("profiles")
              .select("wallet_balance, credit_balance, wallet_deposits")
              .eq("id", userId)
              .single();

            if (profile) {
              const currentBalance = Number(profile.wallet_balance || 0);
              const currentDeposits = Number(profile.wallet_deposits || 0);
              const newBalance = currentBalance + usdValue;
              const newDeposits = currentDeposits + usdValue;

              // Insert transaction in ledger (Only crediting Available Balance)
              const { error: txErr } = await supabaseAdmin.from("wallet_transactions").insert({
                user_id: userId,
                action: "deposit",
                amount: usdValue,
                avail_before: currentBalance,
                avail_after: newBalance,
                credit_before: Number(profile.credit_balance || 0),
                credit_after: Number(profile.credit_balance || 0),
                reason: `Crypto Deposit (${coin.toUpperCase()} - ${network})`,
                external_id: txId,
                notes: `Cryptomus deposit verify. Crypto amount: ${cryptoAmount} ${coin.toUpperCase()}`
              });

              if (!txErr) {
                // Update user profile balance
                await supabaseAdmin
                  .from("profiles")
                  .update({
                    wallet_balance: newBalance,
                    wallet_deposits: newDeposits,
                    wallet_last_updated: new Date().toISOString()
                  })
                  .eq("id", userId);

                totalCreditedUSD += usdValue;
                creditedTransactions.push({ txId, amount: usdValue, coin });

                // Send system chat notification direct message
                try {
                  const { data: bot } = await supabaseAdmin
                    .from("profiles")
                    .select("id")
                    .or("username.eq.jackpotjungle,username.eq.system_updates")
                    .limit(1)
                    .maybeSingle();

                  const senderId = bot?.id;
                  if (senderId) {
                    const notifText = `🎰 *Deposit Confirmed!*\n\nYour deposit of **${cryptoAmount} ${coin.toUpperCase()}** over network **${network}** has been successfully credited.\n\n💰 **+$${usdValue.toFixed(2)} USD** has been added to your **Available Wallet Balance**.`;
                    await supabaseAdmin.from("messages").insert({
                      sender_id: senderId,
                      receiver_id: userId,
                      content: notifText
                    });
                  }
                } catch (msgErr) {
                  console.error("[Verify Deposit] Error sending update message:", msgErr);
                }

                // Insert into user_notifications table for push/in-app notification center
                try {
                  await supabaseAdmin.from("user_notifications").insert({
                    user_id: userId,
                    title: "Deposit Confirmed 💰",
                    content: `Your deposit of ${cryptoAmount} ${coin.toUpperCase()} ($${usdValue.toFixed(2)} USD) has been successfully credited to your Available balance.`,
                    seen: false
                  });
                } catch (notifTableErr) {
                  console.error("[Verify Deposit] Error writing user notification:", notifTableErr);
                }
              } else {
                console.error(`[Verify Deposit] Failed to record wallet transaction for ${txId}:`, txErr);
                continue;
              }
            }
          }

          // Save completed audit trail
          if (cachedDep) {
            await supabaseAdmin
              .from("crypto_deposits")
              .update({
                status: "completed",
                wallet_credited: true,
                confirmations: 1,
                verified_at: new Date().toISOString(),
                usd_value: usdValue,
                txid: dep.txid || cachedDep.txid // Update with real txid if it was uuid previously
              })
              .eq("id", cachedDep.id);
          } else {
            await supabaseAdmin.from("crypto_deposits").insert({
              user_id: userId,
              coin: coin.toUpperCase(),
              network: network.toUpperCase(),
              address,
              amount: cryptoAmount,
              usd_value: usdValue,
              txid: txId,
              confirmations: 1,
              status: "completed",
              wallet_credited: true,
              deposit_time: depositTime,
              verified_at: new Date().toISOString()
            });
          }

        } else if (isPending) {
          // Transaction is still pending or validating on blockchain
          if (!cachedDep) {
            await supabaseAdmin.from("crypto_deposits").insert({
              user_id: userId,
              coin: coin.toUpperCase(),
              network: network.toUpperCase(),
              address,
              amount: cryptoAmount,
              usd_value: usdValue,
              txid: txId,
              confirmations: 0,
              status: "pending",
              wallet_credited: false,
              deposit_time: depositTime
            });
          } else {
            await supabaseAdmin
              .from("crypto_deposits")
              .update({
                status: "pending",
                confirmations: 0,
                usd_value: usdValue
              })
              .eq("id", cachedDep.id);
          }
        }
      }

      if (totalCreditedUSD > 0) {
        return {
          success: true,
          credited: totalCreditedUSD,
          message: `Successfully verified and credited $${totalCreditedUSD.toFixed(2)} to your available balance!`,
          transactions: creditedTransactions
        };
      }

      return {
        success: true,
        credited: 0,
        message: "No new completed deposits found. If you recently sent funds, please wait a few moments for blockchain confirmations."
      };
    } catch (e: any) {
      console.error("[Deposit Service] verifyDeposit failure:", e);
      return { success: false, error: e.message };
    }
  });
