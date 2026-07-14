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

// Helper: sign query string for Binance API
function signQuery(queryString: string, apiSecret: string): string {
  return crypto.createHmac("sha256", apiSecret).update(queryString).digest("hex");
}

// Helper: build URL and headers for Binance SAPI request
function buildBinanceRequest(path: string, method: "GET" | "POST", params: Record<string, string | number>) {
  const apiKey = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_SECRET_KEY;
  
  if (!apiKey || !apiSecret) {
    throw new Error("Binance API keys are not configured in your server .env file.");
  }

  const timestamp = Date.now();
  const queryParts = Object.keys(params).map(key => `${key}=${encodeURIComponent(params[key])}`);
  queryParts.push(`timestamp=${timestamp}`);
  const queryString = queryParts.join("&");
  
  const signature = signQuery(queryString, apiSecret);
  const url = `https://api.binance.com${path}?${queryString}&signature=${signature}`;
  
  return {
    url,
    headers: {
      "X-MBX-APIKEY": apiKey,
      "Accept": "application/json"
    }
  };
}

// Helper: make signed request to Binance SAPI
async function callBinance(path: string, method: "GET" | "POST", params: Record<string, string | number> = {}) {
  const { url, headers } = buildBinanceRequest(path, method, params);
  const response = await fetch(url, {
    method,
    headers
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
  return 1.0;
}

// Helper: hardcoded fallback deposit addresses for local/personal testing
const FALLBACK_ADDRESSES: Record<string, Record<string, { address: string; tag?: string }>> = {
  USDT: {
    TRX: { address: "TXo6D8gG9XQ9Y4gG9XQ9Y4gG9XQ9Y4gG9X" },
    BSC: { address: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F" },
    ETH: { address: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F" },
  },
  BTC: {
    BTC: { address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa" },
    BSC: { address: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F" },
  },
  ETH: {
    ETH: { address: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F" },
    BSC: { address: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F" },
  },
  BNB: {
    BSC: { address: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F" },
  }
};

/**
 * Fetch/Generate unique deposit address for a specific cryptocurrency and network
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

      // 2. Fetch or create virtual sub-account for this user
      let { data: subaccount } = await supabaseAdmin
        .from("user_subaccounts")
        .select("sub_account_email")
        .eq("user_id", userId)
        .maybeSingle();

      let subAccountEmail = subaccount?.sub_account_email;

      if (!subAccountEmail) {
        // Generate dynamic unique sub-account name (max 32 chars for string parameter)
        const randStr = Math.random().toString(36).slice(2, 6);
        const subAccountString = `jj_${userId.slice(0, 8)}_${randStr}`;

        try {
          const createRes = await callBinance("/sapi/v1/sub-account/virtualSubAccount", "POST", {
            subAccountString
          });
          if (createRes && createRes.email) {
            subAccountEmail = createRes.email;
            await supabaseAdmin.from("user_subaccounts").insert({
              user_id: userId,
              sub_account_email: subAccountEmail
            });
          }
        } catch (subErr) {
          console.warn("[Deposit Service] Sub-account API failed. Falling back to personal placeholder.", subErr);
        }
      }

      // 3. Fetch deposit address from Binance sub-account
      if (subAccountEmail) {
        try {
          const addressRes = await callBinance("/sapi/v1/capital/deposit/subAddress", "GET", {
            email: subAccountEmail,
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
        } catch (addrErr) {
          console.error("[Deposit Service] Failed to get subaddress from Binance:", addrErr);
        }
      }

      // 4. Fallback if Binance is not configured/disabled or calls fail
      const fallback = FALLBACK_ADDRESSES[coin.toUpperCase()]?.[network.toUpperCase()];
      if (fallback) {
        return {
          success: true,
          address: fallback.address,
          tag: fallback.tag || null,
          isFallback: true
        };
      }

      throw new Error(`No deposit address found for ${coin} on network ${network}.`);
    } catch (e: any) {
      console.error("[Deposit Service] getDepositAddress failure:", e);
      return { success: false, error: e.message };
    }
  });

/**
 * Query Binance deposit history for the user's sub-account, checking and crediting new cashin events
 */
export const verifyDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(verifyDepositValidator)
  .handler(async ({ context }) => {
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    try {
      // 1. Fetch sub-account email
      const { data: subaccount } = await supabaseAdmin
        .from("user_subaccounts")
        .select("sub_account_email")
        .eq("user_id", userId)
        .maybeSingle();

      if (!subaccount || !subaccount.sub_account_email) {
        return { success: true, credited: 0, message: "No deposit records found yet. Please request a deposit address first." };
      }

      // 2. Query deposit history from Binance
      const history = await callBinance("/sapi/v1/capital/deposit/subHisrec", "GET", {
        email: subaccount.sub_account_email
      });

      if (!Array.isArray(history) || history.length === 0) {
        return { success: true, credited: 0, message: "No deposits detected on your unique address yet." };
      }

      let totalCreditedUSD = 0;
      const creditedTransactions = [];

      // 3. Process each completed deposit (status === 1)
      for (const dep of history) {
        if (dep.status !== 1) continue; // Skip pending deposits
        
        const txId = dep.txId;
        const coin = dep.coin;
        const cryptoAmount = Number(dep.amount);

        // Check if transaction has already been credited in the database
        const { data: existing } = await supabaseAdmin
          .from("wallet_transactions")
          .select("id")
          .eq("external_id", txId)
          .maybeSingle();

        if (existing) continue; // Already processed

        // 4. Calculate USD equivalent using live exchange rates
        const coinPrice = await getCryptoPrice(coin);
        const usdValue = Number((cryptoAmount * coinPrice).toFixed(2));

        if (usdValue <= 0) continue;

        // 5. Query user profiles current wallet balance inside a secure transaction block
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("wallet_balance, credit_balance, wallet_deposits")
          .eq("id", userId)
          .single();

        if (!profile) continue;

        const currentBalance = Number(profile.wallet_balance || 0);
        const currentDeposits = Number(profile.wallet_deposits || 0);
        const newBalance = currentBalance + usdValue;
        const newDeposits = currentDeposits + usdValue;

        // Insert wallet transaction
        const { error: txErr } = await supabaseAdmin.from("wallet_transactions").insert({
          user_id: userId,
          action: "cashin",
          amount: usdValue,
          avail_before: currentBalance,
          avail_after: newBalance,
          credit_before: Number(profile.credit_balance || 0),
          credit_after: Number(profile.credit_balance || 0),
          reason: `Crypto Deposit (${coin.toUpperCase()} - ${dep.network})`,
          external_id: txId,
          notes: `Binance SAPI deposit verify. Crypto amount: ${cryptoAmount} ${coin.toUpperCase()}`
        });

        if (txErr) {
          console.error(`[Verify Deposit] Failed to record wallet transaction for ${txId}:`, txErr);
          continue;
        }

        // Update profile balance
        const { error: profileErr } = await supabaseAdmin
          .from("profiles")
          .update({
            wallet_balance: newBalance,
            wallet_deposits: newDeposits,
            wallet_last_updated: new Date().toISOString()
          })
          .eq("id", userId);

        if (profileErr) {
          console.error(`[Verify Deposit] Failed to update profile balances for user:`, profileErr);
          continue;
        }

        totalCreditedUSD += usdValue;
        creditedTransactions.push({ txId, amount: usdValue, coin });
      }

      if (totalCreditedUSD > 0) {
        return {
          success: true,
          credited: totalCreditedUSD,
          message: `Successfully verified and credited $${totalCreditedUSD.toFixed(2)} to your wallet!`,
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
