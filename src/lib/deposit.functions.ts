import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import crypto from "crypto";

const getAddressValidator = z.object({
  coin: z.string(),
  network: z.string(),
});

const verifyDepositValidator = z.object({
  txid: z.string().optional(),
  coin: z.string().optional(),
});

// Helper: sign query string for Binance API
function signQuery(queryString: string, apiSecret: string): string {
  return crypto.createHmac("sha256", apiSecret).update(queryString).digest("hex");
}

let cachedBinanceApiKey = "";
let cachedBinanceSecretKey = "";

async function getBinanceKeys(supabaseAdmin: any): Promise<{ apiKey: string; apiSecret: string }> {
  // 1. Try env variables first
  const envKey = process.env.BINANCE_API_KEY;
  const envSecret = process.env.BINANCE_SECRET_KEY;

  if (envKey && envSecret) {
    return { apiKey: envKey, apiSecret: envSecret };
  }

  // 2. Try in-memory cache
  if (cachedBinanceApiKey && cachedBinanceSecretKey) {
    return { apiKey: cachedBinanceApiKey, apiSecret: cachedBinanceSecretKey };
  }

  // 3. Query Supabase system_settings table
  try {
    const { data } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", "binance_keys")
      .maybeSingle();

    if (data?.value) {
      const val = data.value as any;
      if (val.api_key && val.secret_key) {
        cachedBinanceApiKey = val.api_key;
        cachedBinanceSecretKey = val.secret_key;
        return { apiKey: val.api_key, apiSecret: val.secret_key };
      }
    }
  } catch (e) {
    console.error("[Deposit Service] Failed to retrieve Binance keys from DB:", e);
  }

  throw new Error("Binance API keys are not configured in your server .env file or system settings database.");
}

// Helper: make signed request to Binance SAPI
async function callBinance(
  supabaseAdmin: any,
  path: string,
  method: "GET" | "POST",
  params: Record<string, string | number> = {}
) {
  const { apiKey, apiSecret } = await getBinanceKeys(supabaseAdmin);
  
  const timestamp = Date.now();
  const queryParts = Object.keys(params).map(key => `${key}=${encodeURIComponent(params[key])}`);
  queryParts.push(`timestamp=${timestamp}`);
  const queryString = queryParts.join("&");
  
  const signature = signQuery(queryString, apiSecret);
  const url = `https://api.binance.com${path}?${queryString}&signature=${signature}`;

  const response = await fetch(url, {
    method,
    headers: {
      "X-MBX-APIKEY": apiKey,
      "Accept": "application/json"
    }
  });
  
  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[Binance API Error] ${method} ${path} -> Status: ${response.status}. Body:`, errorBody);
    throw new Error(`Binance API Error (${response.status}): ${errorBody}`);
  }
  
  return response.json();
}

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

/**
 * Fetch/Generate unique deposit address for a specific cryptocurrency and network via Binance Main Account
 */
export const getDepositAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(getAddressValidator)
  .handler(async ({ data, context }) => {
    const { coin, network } = data;
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
      const addressRes = await callBinance(supabaseAdmin, "/sapi/v1/capital/deposit/address", "GET", {
        coin: coin.toUpperCase(),
        network: network.toUpperCase()
      });

      if (addressRes && addressRes.address) {
        // Cache the retrieved address in the database
        await supabaseAdmin.from("user_deposit_addresses").insert({
          user_id: userId,
          coin: coin.toUpperCase(),
          network: network.toUpperCase(),
          address: addressRes.address,
          tag: addressRes.tag || null
        });

        return {
          success: true,
          address: addressRes.address,
          tag: addressRes.tag || null,
          isFallback: false
        };
      }
      
      throw new Error(`No deposit address returned from Binance API.`);
    } catch (e: any) {
      console.error("[Deposit Service] getDepositAddress failure:", e);
      return { success: false, error: e.message };
    }
  });

/**
 * Query Binance deposit history for the main account, matching the user's TXID
 */
export const verifyDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(verifyDepositValidator)
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const { txid, coin } = data;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // If no txid is provided, check if the user has any pending deposits in the database
    let targetTxid = txid;
    let targetCoin = coin;

    if (!targetTxid) {
      const { data: pendingDep } = await supabaseAdmin
        .from("crypto_deposits")
        .select("txid, coin")
        .eq("user_id", userId)
        .eq("status", "pending")
        .limit(1)
        .maybeSingle();

      if (pendingDep) {
        targetTxid = pendingDep.txid;
        targetCoin = pendingDep.coin;
      }
    }

    if (!targetTxid || !targetCoin) {
      return { success: true, credited: 0, message: "No pending or new deposit transactions to verify." };
    }

    try {
      // 1. Check if this TXID has already been claimed by anyone in database
      const { data: existingDep } = await supabaseAdmin
        .from("crypto_deposits")
        .select("id, user_id, status, wallet_credited")
        .eq("txid", targetTxid.trim())
        .maybeSingle();

      if (existingDep && existingDep.wallet_credited) {
        if (existingDep.user_id === userId) {
          return { success: false, error: "You have already claimed this deposit." };
        } else {
          return { success: false, error: "This deposit has already been claimed by another user." };
        }
      }

      const history = await callBinance(supabaseAdmin, "/sapi/v1/capital/deposit/hisrec", "GET", {
        coin: targetCoin.toUpperCase()
      });

      if (!Array.isArray(history) || history.length === 0) {
        return { success: false, error: "No matching deposits found on your Binance account yet." };
      }

      // 3. Find the deposit matching the provided txid
      const dep = history.find(d => d.txId && d.txId.toLowerCase() === targetTxid.trim().toLowerCase());

      if (!dep) {
        return { 
          success: false, 
          error: "Could not find a deposit matching this Transaction ID. Please ensure the transaction is completed on your wallet." 
        };
      }

      const txId = dep.txId;
      const network = dep.network || "UNKNOWN";
      const address = dep.address || "UNKNOWN";
      const cryptoAmount = Number(dep.amount);
      const binanceStatus = dep.status; // 1 = success, 0 = pending, 6 = credited but cannot withdraw
      const depositTime = dep.insertTime ? new Date(dep.insertTime).toISOString() : new Date().toISOString();

      // Calculate USD value using exchange rates
      const coinPrice = await getCryptoPrice(targetCoin);
      const usdValue = Number((cryptoAmount * coinPrice).toFixed(2));

      if (binanceStatus === 1) {
        let shouldCredit = true;

        // Double check wallet_transactions to prevent duplicate crediting
        const { data: existingTx } = await supabaseAdmin
          .from("wallet_transactions")
          .select("id")
          .eq("external_id", txId)
          .maybeSingle();
        
        if (existingTx) {
          shouldCredit = false;
        }

        if (shouldCredit && usdValue > 0) {
          // Credit user profile
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

            // Record transaction ledger
            const { error: txErr } = await supabaseAdmin.from("wallet_transactions").insert({
              user_id: userId,
              action: "deposit",
              amount: usdValue,
              avail_before: currentBalance,
              avail_after: newBalance,
              credit_before: Number(profile.credit_balance || 0),
              credit_after: Number(profile.credit_balance || 0),
              reason: `Crypto Deposit (${targetCoin.toUpperCase()} - ${network})`,
              external_id: txId,
              notes: `Binance main account TXID claim. Crypto amount: ${cryptoAmount} ${targetCoin.toUpperCase()}`
            });

            if (!txErr) {
              await supabaseAdmin
                .from("profiles")
                .update({
                  wallet_balance: newBalance,
                  wallet_deposits: newDeposits,
                  wallet_last_updated: new Date().toISOString()
                })
                .eq("id", userId);

              // Create deposit record
              if (existingDep) {
                await supabaseAdmin
                  .from("crypto_deposits")
                  .update({
                    status: "completed",
                    wallet_credited: true,
                    confirmations: 1,
                    verified_at: new Date().toISOString(),
                    usd_value: usdValue
                  })
                  .eq("id", existingDep.id);
              } else {
                await supabaseAdmin.from("crypto_deposits").insert({
                  user_id: userId,
                  coin: targetCoin.toUpperCase(),
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

              // Send system notifications
              try {
                const { data: bot } = await supabaseAdmin
                  .from("profiles")
                  .select("id")
                  .or("username.eq.jackpotjungle,username.eq.system_updates")
                  .limit(1)
                  .maybeSingle();

                const senderId = bot?.id;
                if (senderId) {
                  const notifText = `🎰 *Deposit Confirmed!*\n\nYour deposit of **${cryptoAmount} ${targetCoin.toUpperCase()}** over network **${network}** has been successfully credited.\n\n💰 **+$${usdValue.toFixed(2)} USD** has been added to your **Available Wallet Balance**.`;
                  await supabaseAdmin.from("messages").insert({
                    sender_id: senderId,
                    receiver_id: userId,
                    content: notifText
                  });
                }
              } catch (msgErr) {
                console.error("[Verify Deposit] Error sending update message:", msgErr);
              }

              try {
                await supabaseAdmin.from("user_notifications").insert({
                  user_id: userId,
                  title: "Deposit Confirmed 💰",
                  content: `Your deposit of ${cryptoAmount} ${targetCoin.toUpperCase()} ($${usdValue.toFixed(2)} USD) has been successfully credited to your Available balance.`,
                  seen: false
                });
              } catch (notifTableErr) {
                console.error("[Verify Deposit] Error writing user notification:", notifTableErr);
              }

              return {
                success: true,
                credited: usdValue,
                message: `Successfully verified and credited $${usdValue.toFixed(2)} to your available balance!`
              };
            }
          }
        }
      } else {
        // Pending status on Binance
        if (!existingDep) {
          await supabaseAdmin.from("crypto_deposits").insert({
            user_id: userId,
            coin: targetCoin.toUpperCase(),
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
        }
        return {
          success: false,
          error: "Your transaction is still pending blockchain confirmation on Binance. Please try claiming again in 1-2 minutes."
        };
      }

      return { success: false, error: "Failed to process claim. Please contact support." };
    } catch (e: any) {
      console.error("[Deposit Service] verifyDeposit failure:", e);
      return { success: false, error: e.message };
    }
  });
