import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import crypto from "crypto";
import http from "http";
import https from "https";

const getAddressValidator = z.object({
  coin: z.string(),
  network: z.string(),
});

const verifyDepositValidator = z.object({
  txid: z.string(),
  coin: z.string(),
  network: z.string(),
});

// Cache working proxy in-memory
let activeProxy: { host: string; port: number } | null = null;

// Helper: sign query string for Binance API
function signQuery(queryString: string, apiSecret: string): string {
  return crypto.createHmac("sha256", apiSecret).update(queryString).digest("hex");
}

// Native CONNECT tunnel proxy fetch
function fetchViaProxy(url: string, proxyHost: string, proxyPort: number, options: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const reqOptions = {
      host: proxyHost,
      port: proxyPort,
      method: 'CONNECT',
      path: `${parsedUrl.hostname}:443`,
      headers: {
        Host: parsedUrl.hostname
      }
    };

    // Timeout proxy CONNECT after 2.5 seconds (prevents slow proxies from dragging down the request)
    const req = http.request(reqOptions);
    req.setTimeout(2500);
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error("Proxy CONNECT timeout"));
    });

    req.on('connect', (res, socket, head) => {
      if (res.statusCode !== 200) {
        reject(new Error(`CONNECT failed: ${res.statusCode}`));
        return;
      }

      const agent = new https.Agent({ socket, rejectUnauthorized: false });
      const clientReq = https.request({
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        headers: options.headers,
        agent: agent
      }, (clientRes) => {
        let data = '';
        clientRes.on('data', chunk => data += chunk);
        clientRes.on('end', () => {
          resolve({
            status: clientRes.statusCode,
            statusText: clientRes.statusMessage,
            text: () => Promise.resolve(data),
            json: () => {
              try {
                return Promise.resolve(JSON.parse(data));
              } catch (e) {
                return Promise.reject(new Error(`Failed to parse proxy response: ${data}`));
              }
            }
          });
        });
      });

      clientReq.on('error', reject);
      if (options.body) clientReq.write(options.body);
      clientReq.end();
    });

    req.on('error', reject);
    req.end();
  });
}

// Fetch proxy list from free API
async function getProxies(): Promise<{ host: string; port: number }[]> {
  try {
    const res = await fetch("https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=1000&country=all&ssl=yes&anonymity=all");
    if (!res.ok) return [];
    const text = await res.text();
    return text.split("\n").map(p => p.trim()).filter(p => p.includes(":")).map(p => {
      const [host, port] = p.split(":");
      return { host, port: parseInt(port, 10) };
    });
  } catch (e) {
    console.error("[Proxy] Failed to fetch proxy list:", e);
    return [];
  }
}

// Race top 20 proxies concurrently using native CONNECT ping requests
async function findFastestProxy(proxyList: { host: string; port: number }[]): Promise<{ host: string; port: number }> {
  const candidates = proxyList.slice(0, 25); // Test top 25 candidates
  
  const promises = candidates.map(proxy => {
    return new Promise<{ host: string; port: number }>(async (resolve, reject) => {
      try {
        const res = await fetchViaProxy("https://api.binance.com/api/v3/ping", proxy.host, proxy.port);
        if (res.status === 200) {
          resolve(proxy);
        } else {
          reject(new Error("Ping failed"));
        }
      } catch (e) {
        reject(e);
      }
    });
  });

  try {
    return await Promise.any(promises);
  } catch (err) {
    throw new Error("No working proxy succeeded in parallel ping race.");
  }
}

// Load cached proxy from DB settings
async function getCachedProxy(supabaseAdmin: any): Promise<{ host: string; port: number } | null> {
  if (activeProxy) return activeProxy;
  try {
    const { data } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", "active_binance_proxy")
      .maybeSingle();
    if (data?.value) {
      const val = data.value as any;
      if (val.host && val.port) {
        activeProxy = { host: val.host, port: Number(val.port) };
        return activeProxy;
      }
    }
  } catch (e) {
    console.error("Failed to load proxy from DB:", e);
  }
  return null;
}

// Persist working proxy to DB settings
async function saveCachedProxy(supabaseAdmin: any, proxy: { host: string; port: number }) {
  activeProxy = proxy;
  try {
    await supabaseAdmin.from("system_settings").upsert({
      key: "active_binance_proxy",
      value: { host: proxy.host, port: proxy.port },
      updated_at: new Date().toISOString()
    });
  } catch (e) {
    console.error("Failed to save proxy to DB:", e);
  }
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

// Helper: make signed request to Binance SAPI (with automatic parallel geoblocking proxy fallback)
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
  const headers = {
    "X-MBX-APIKEY": apiKey,
    "Accept": "application/json"
  };

  // 1. Try currently active proxy loaded from DB/memory
  const proxy = await getCachedProxy(supabaseAdmin);
  if (proxy) {
    try {
      const res = await fetchViaProxy(url, proxy.host, proxy.port, { method, headers });
      if (res.status === 200) {
        return res.json();
      } else if (res.status === 451) {
        activeProxy = null; // Clear from memory
        await supabaseAdmin.from("system_settings").delete().eq("key", "active_binance_proxy").catch(() => {});
      }
    } catch (e) {
      activeProxy = null;
      await supabaseAdmin.from("system_settings").delete().eq("key", "active_binance_proxy").catch(() => {});
    }
  }

  // 2. Try direct call (in case geo-restrictions are resolved or not applicable)
  try {
    const directRes = await fetch(url, { method, headers });
    if (directRes.status === 200) {
      return directRes.json();
    }
    if (directRes.status !== 451) {
      const errorBody = await directRes.text();
      throw new Error(`Binance API Error (${directRes.status}): ${errorBody}`);
    }
  } catch (directErr: any) {
    if (!directErr.message?.includes("451") && !directErr.message?.includes("fetch failed")) {
      throw directErr;
    }
  }

  // 3. Scan for a new working proxy concurrently using a fast parallel ping race
  console.log("[Binance SAPI] Direct request geo-blocked. Racing anonymous proxies in parallel...");
  const proxyList = await getProxies();
  if (proxyList.length === 0) {
    throw new Error("Binance SAPI requests are geoblocked on this VPS, and no proxies are currently available.");
  }

  try {
    const winningProxy = await findFastestProxy(proxyList);
    console.log(`[Binance SAPI] Race winner: ${winningProxy.host}:${winningProxy.port}. Executing request...`);
    
    // Save winning proxy to DB for persistent use
    await saveCachedProxy(supabaseAdmin, winningProxy);

    const res = await fetchViaProxy(url, winningProxy.host, winningProxy.port, { method, headers });
    if (res.status === 200) {
      return res.json();
    } else {
      const errorBody = await res.text();
      throw new Error(`Binance API Error via proxy: ${errorBody}`);
    }
  } catch (err: any) {
    throw new Error(`Binance SAPI geoblock bypass failed: ${err.message}`);
  }
}

// Helper: fetch current live crypto price in USD using non-restricted public API
async function getCryptoPrice(coin: string): Promise<number> {
  const normalized = coin.toUpperCase();
  if (["USDT", "BUSD", "USDC"].includes(normalized)) {
    return 1.0;
  }
  try {
    const res = await fetch(`https://api.coinbase.com/v2/prices/${normalized}-USD/spot`);
    if (res.ok) {
      const data = await res.json();
      const price = Number(data?.data?.amount);
      if (price > 0) return price;
    }
  } catch (e) {
    console.error(`Failed to fetch live price for ${coin}:`, e);
  }
  // Hardcoded fallback exchange rates if external API is down
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

      // 2. Fetch deposit address from Binance main account
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
    const { txid, coin, network } = data;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!txid?.trim()) {
      return { success: false, error: "Please enter a Transaction ID (TXID)." };
    }

    try {
      // 1. Check if this TXID has already been claimed by anyone in database
      const { data: existingDep } = await supabaseAdmin
        .from("crypto_deposits")
        .select("id, user_id, status, wallet_credited")
        .eq("txid", txid.trim())
        .maybeSingle();

      if (existingDep && existingDep.wallet_credited) {
        if (existingDep.user_id === userId) {
          return { success: false, error: "You have already claimed this deposit." };
        } else {
          return { success: false, error: "This deposit has already been claimed by another user." };
        }
      }

      // 2. Fetch deposit history from Binance main account
      const history = await callBinance(supabaseAdmin, "/sapi/v1/capital/deposit/hisrec", "GET", {
        coin: coin.toUpperCase()
      });

      if (!Array.isArray(history) || history.length === 0) {
        return { success: false, error: "No matching deposits found on your Binance account yet." };
      }

      // 3. Find the deposit matching the provided txid
      const dep = history.find(d => d.txId && d.txId.toLowerCase() === txid.trim().toLowerCase());

      if (!dep) {
        return { 
          success: false, 
          error: "Could not find a deposit matching this Transaction ID. Please ensure the transaction is completed on your wallet." 
        };
      }

      const txId = dep.txId;
      const verifiedNetwork = dep.network || network.toUpperCase();
      const address = dep.address || "UNKNOWN";
      const cryptoAmount = Number(dep.amount);
      const binanceStatus = dep.status; // 1 = success, 0 = pending, 6 = credited but cannot withdraw
      const depositTime = dep.insertTime ? new Date(dep.insertTime).toISOString() : new Date().toISOString();

      // Calculate USD value using exchange rates
      const coinPrice = await getCryptoPrice(coin);
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
              reason: `Crypto Deposit (${coin.toUpperCase()} - ${verifiedNetwork})`,
              external_id: txId,
              notes: `Binance main account TXID claim. Crypto amount: ${cryptoAmount} ${coin.toUpperCase()}`
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
                  coin: coin.toUpperCase(),
                  network: verifiedNetwork.toUpperCase(),
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
                  const notifText = `🎰 *Deposit Confirmed!*\n\nYour deposit of **${cryptoAmount} ${coin.toUpperCase()}** over network **${verifiedNetwork}** has been successfully credited.\n\n💰 **+$${usdValue.toFixed(2)} USD** has been added to your **Available Wallet Balance**.`;
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
                  content: `Your deposit of ${cryptoAmount} ${coin.toUpperCase()} ($${usdValue.toFixed(2)} USD) has been successfully credited to your Available balance.`,
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
            coin: coin.toUpperCase(),
            network: verifiedNetwork.toUpperCase(),
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
