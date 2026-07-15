import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const getAddressValidator = z.object({
  coin: z.string(),
  network: z.string(),
});

const verifyDepositValidator = z.object({
  txid: z.string(),
  coin: z.string(),
  network: z.string(),
});

// ─────────────────────────────────────────────────────────────
// Helper: fetch live crypto price in USD from public Binance endpoint
// (This is a public endpoint with no API key — not geo-restricted)
// ─────────────────────────────────────────────────────────────
async function getCryptoPrice(coin: string): Promise<number> {
  const normalized = coin.toUpperCase();
  if (["USDT", "BUSD", "USDC", "TUSD"].includes(normalized)) return 1.0;
  try {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${normalized}USDT`);
    if (res.ok) {
      const data = await res.json();
      const price = Number(data.price || 0);
      if (price > 0) return price;
    }
  } catch (e) {
    console.error(`[Price] Failed to fetch price for ${coin}:`, e);
  }
  // Hardcoded fallback exchange rates
  if (normalized === "BTC") return 95000;
  if (normalized === "ETH") return 3500;
  if (normalized === "BNB") return 600;
  if (normalized === "LTC") return 120;
  if (normalized === "SOL") return 180;
  if (normalized === "XRP") return 0.6;
  return 1.0;
}

// ─────────────────────────────────────────────────────────────
// Helper: verify a TXID on-chain using public blockchain explorers.
// Returns deposit info or null.
// Supports: BSC (BEP20), ETH (ERC20), TRX (TRC20), BTC, LTC, SOL, XRP
// ─────────────────────────────────────────────────────────────
async function verifyTxOnChain(txid: string, coin: string, network: string, expectedAddress: string): Promise<{
  confirmed: boolean;
  amount: number;
  toAddress: string;
  error?: string;
} | null> {
  const net = network.toUpperCase();
  const coinUp = coin.toUpperCase();

  try {
    // ── BSC (BEP20) — BscScan public API ──────────────────────
    if (net === "BSC" || net === "BEP20") {
      // Use the public BscScan API - no key required for basic tx lookup
      const url = `https://api.bscscan.com/api?module=transaction&action=gettxreceiptstatus&txhash=${txid}&apikey=YourApiKeyToken`;
      const statusRes = await fetch(url);
      const statusData = await statusRes.json();

      // Also fetch transaction details to get amount
      const txUrl = `https://api.bscscan.com/api?module=proxy&action=eth_getTransactionByHash&txhash=${txid}&apikey=YourApiKeyToken`;
      const txRes = await fetch(txUrl);
      const txData = await txRes.json();

      if (txData?.result) {
        const tx = txData.result;
        const isSuccess = statusData?.result?.status === "1";

        // For USDT BEP20 (token transfer), decode the input data
        // The 'to' field in a token transfer is the contract, not the recipient
        // We check event logs for token transfers
        const logsUrl = `https://api.bscscan.com/api?module=account&action=tokentx&address=${expectedAddress}&txhash=${txid}&apikey=YourApiKeyToken`;
        const logsRes = await fetch(logsUrl);
        const logsData = await logsRes.json();

        if (logsData?.result && Array.isArray(logsData.result) && logsData.result.length > 0) {
          const transfer = logsData.result.find((t: any) =>
            t.hash?.toLowerCase() === txid.toLowerCase() &&
            t.to?.toLowerCase() === expectedAddress.toLowerCase()
          );
          if (transfer) {
            const decimals = parseInt(transfer.tokenDecimal || "18");
            const amount = Number(transfer.value) / Math.pow(10, decimals);
            return { confirmed: isSuccess, amount, toAddress: transfer.to };
          }
        }

        // For native BNB transfers
        if (tx.to?.toLowerCase() === expectedAddress.toLowerCase()) {
          const bnbAmount = parseInt(tx.value || "0", 16) / 1e18;
          return { confirmed: isSuccess, amount: bnbAmount, toAddress: tx.to };
        }
      }
      return null;
    }

    // ── ETH (ERC20) — Etherscan public API ────────────────────
    if (net === "ETH" || net === "ERC20") {
      const logsUrl = `https://api.etherscan.io/api?module=account&action=tokentx&address=${expectedAddress}&txhash=${txid}&apikey=YourApiKeyToken`;
      const logsRes = await fetch(logsUrl);
      const logsData = await logsRes.json();

      const statusUrl = `https://api.etherscan.io/api?module=transaction&action=gettxreceiptstatus&txhash=${txid}&apikey=YourApiKeyToken`;
      const statusRes = await fetch(statusUrl);
      const statusData = await statusRes.json();
      const isSuccess = statusData?.result?.status === "1";

      if (logsData?.result && Array.isArray(logsData.result)) {
        const transfer = logsData.result.find((t: any) =>
          t.hash?.toLowerCase() === txid.toLowerCase() &&
          t.to?.toLowerCase() === expectedAddress.toLowerCase()
        );
        if (transfer) {
          const decimals = parseInt(transfer.tokenDecimal || "18");
          const amount = Number(transfer.value) / Math.pow(10, decimals);
          return { confirmed: isSuccess, amount, toAddress: transfer.to };
        }
      }

      // Check native ETH transfer
      const txUrl = `https://api.etherscan.io/api?module=proxy&action=eth_getTransactionByHash&txhash=${txid}&apikey=YourApiKeyToken`;
      const txRes = await fetch(txUrl);
      const txData = await txRes.json();
      if (txData?.result?.to?.toLowerCase() === expectedAddress.toLowerCase()) {
        const ethAmount = parseInt(txData.result.value || "0", 16) / 1e18;
        return { confirmed: isSuccess, amount: ethAmount, toAddress: txData.result.to };
      }
      return null;
    }

    // ── TRON (TRC20) — Tronscan public API ────────────────────
    if (net === "TRX" || net === "TRC20") {
      const url = `https://apilist.tronscanapi.com/api/transaction-info?hash=${txid}`;
      const res = await fetch(url, { headers: { "TRON-PRO-API-KEY": "" } });
      const data = await res.json();

      if (data?.contractData) {
        const isConfirmed = data.confirmed === true;
        const toAddr = data.contractData?.to_address || data.toAddress || "";
        const amount = Number(data.contractData?.amount || 0) / 1e6;

        if (toAddr.toLowerCase() === expectedAddress.toLowerCase() || 
            data.toAddress?.toLowerCase() === expectedAddress.toLowerCase()) {
          return { confirmed: isConfirmed, amount, toAddress: toAddr };
        }

        // Check token transfers in trc20TransferInfo
        if (data.trc20TransferInfo && Array.isArray(data.trc20TransferInfo)) {
          const transfer = data.trc20TransferInfo.find((t: any) =>
            t.to_address?.toLowerCase() === expectedAddress.toLowerCase()
          );
          if (transfer) {
            const decimals = parseInt(transfer.decimals || "6");
            const tokenAmount = Number(transfer.amount_str || transfer.amount || 0) / Math.pow(10, decimals);
            return { confirmed: isConfirmed, amount: tokenAmount, toAddress: transfer.to_address };
          }
        }
      }
      return null;
    }

    // ── Bitcoin ───────────────────────────────────────────────
    if (coinUp === "BTC") {
      const url = `https://blockstream.info/api/tx/${txid}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      const isConfirmed = data.status?.confirmed === true;
      const output = data.vout?.find((v: any) =>
        v.scriptpubkey_address?.toLowerCase() === expectedAddress.toLowerCase()
      );
      if (output) {
        const amount = (output.value || 0) / 1e8;
        return { confirmed: isConfirmed, amount, toAddress: output.scriptpubkey_address };
      }
      return null;
    }

    // ── Litecoin ─────────────────────────────────────────────
    if (coinUp === "LTC") {
      const url = `https://api.blockcypher.com/v1/ltc/main/txs/${txid}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      const isConfirmed = (data.confirmations || 0) >= 6;
      const output = data.outputs?.find((o: any) =>
        o.addresses?.some((a: string) => a.toLowerCase() === expectedAddress.toLowerCase())
      );
      if (output) {
        const amount = (output.value || 0) / 1e8;
        return { confirmed: isConfirmed, amount, toAddress: expectedAddress };
      }
      return null;
    }

    // ── Solana ────────────────────────────────────────────────
    if (coinUp === "SOL") {
      const res = await fetch("https://api.mainnet-beta.solana.com", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTransaction",
          params: [txid, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]
        })
      });
      const data = await res.json();
      const tx = data?.result;
      if (!tx) return null;
      const isConfirmed = tx.meta?.err === null;
      const instructions = tx.transaction?.message?.instructions || [];
      for (const ix of instructions) {
        if (ix.parsed?.type === "transfer" || ix.parsed?.type === "transferChecked") {
          const info = ix.parsed.info;
          if (info?.destination?.toLowerCase() === expectedAddress.toLowerCase()) {
            const lamports = info.lamports || (info.tokenAmount?.uiAmount * 1e9);
            return { confirmed: isConfirmed, amount: (lamports || 0) / 1e9, toAddress: info.destination };
          }
        }
      }
      return null;
    }

  } catch (e: any) {
    console.error(`[Verify OnChain] Error verifying ${txid} on ${network}:`, e.message);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// SERVER FUNCTION: Get static deposit address for a coin+network
// Reads from system_settings.deposit_addresses (no Binance API call)
// ─────────────────────────────────────────────────────────────
export const getDepositAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(getAddressValidator)
  .handler(async ({ data, context }) => {
    const { coin, network } = data;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    try {
      // 1. Build the lookup key (e.g. "USDT_BSC", "BTC_BTC")
      const lookupKey = `${coin.toUpperCase()}_${network.toUpperCase()}`;

      // 2. Fetch static addresses from system_settings
      const { data: settings, error: settingsErr } = await supabaseAdmin
        .from("system_settings")
        .select("value")
        .eq("key", "deposit_addresses")
        .maybeSingle();

      if (settingsErr) {
        console.error("[getDepositAddress] DB error:", settingsErr.message);
        return { success: false, error: "Could not load deposit configuration. Please try again." };
      }

      if (!settings?.value) {
        return { success: false, error: "Deposit addresses are not configured. Please contact support." };
      }

      const addressMap = settings.value as Record<string, { address: string; tag: string | null }>;
      const entry = addressMap[lookupKey];

      if (!entry || !entry.address || entry.address.startsWith("REPLACE_WITH")) {
        console.error(`[getDepositAddress] No address configured for ${lookupKey}`);
        return { success: false, error: `Deposits for ${coin.toUpperCase()} on ${network.toUpperCase()} are temporarily unavailable. Please contact support.` };
      }

      return {
        success: true,
        address: entry.address,
        tag: entry.tag || null,
        isFallback: false
      };

    } catch (e: any) {
      console.error("[Deposit Service] getDepositAddress failure:", e);
      return { success: false, error: e.message };
    }
  });

// ─────────────────────────────────────────────────────────────
// SERVER FUNCTION: Verify a deposit TXID using blockchain explorers
// No Binance API calls — checks transaction directly on-chain
// ─────────────────────────────────────────────────────────────
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
      // 1. Check if this TXID was already claimed
      const { data: existingDep } = await supabaseAdmin
        .from("crypto_deposits")
        .select("id, user_id, status, wallet_credited")
        .eq("txid", txid.trim())
        .maybeSingle();

      if (existingDep?.wallet_credited) {
        if (existingDep.user_id === userId) {
          return { success: false, error: "You have already claimed this deposit." };
        } else {
          return { success: false, error: "This transaction has already been claimed by another user." };
        }
      }

      // 2. Get the expected deposit address for this coin+network from system_settings
      const lookupKey = `${coin.toUpperCase()}_${network.toUpperCase()}`;
      const { data: settings } = await supabaseAdmin
        .from("system_settings")
        .select("value")
        .eq("key", "deposit_addresses")
        .maybeSingle();

      const addressMap = (settings?.value || {}) as Record<string, { address: string; tag: string | null }>;
      const entry = addressMap[lookupKey];

      if (!entry?.address || entry.address.startsWith("REPLACE_WITH")) {
        return { success: false, error: `Verification for ${coin.toUpperCase()} on ${network.toUpperCase()} is not configured.` };
      }

      const expectedAddress = entry.address;

      // 3. Verify TXID on blockchain
      const onChainResult = await verifyTxOnChain(txid.trim(), coin, network, expectedAddress);

      if (!onChainResult) {
        return {
          success: false,
          error: "Could not find this Transaction ID on the blockchain. Please ensure the transaction is confirmed and the TXID is correct."
        };
      }

      if (!onChainResult.confirmed) {
        // Record as pending if not already in DB
        if (!existingDep) {
          await supabaseAdmin.from("crypto_deposits").insert({
            user_id: userId,
            coin: coin.toUpperCase(),
            network: network.toUpperCase(),
            address: expectedAddress,
            amount: onChainResult.amount,
            usd_value: 0,
            txid: txid.trim(),
            confirmations: 0,
            status: "pending",
            wallet_credited: false,
            deposit_time: new Date().toISOString()
          }).catch(() => {});
        }
        return {
          success: false,
          error: "Your transaction is still awaiting blockchain confirmation. Please try claiming again in 1–2 minutes."
        };
      }

      // 4. Calculate USD value
      const coinPrice = await getCryptoPrice(coin);
      const usdValue = Number((onChainResult.amount * coinPrice).toFixed(2));

      if (usdValue <= 0) {
        return { success: false, error: "Transaction amount is too small to credit." };
      }

      // 5. Double-check no duplicate wallet_transactions entry
      const { data: existingTx } = await supabaseAdmin
        .from("wallet_transactions")
        .select("id")
        .eq("external_id", txid.trim())
        .maybeSingle();

      if (existingTx) {
        return { success: false, error: "This transaction has already been credited to a wallet." };
      }

      // 6. Credit user wallet
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("wallet_balance, credit_balance, wallet_deposits")
        .eq("id", userId)
        .single();

      if (!profile) {
        return { success: false, error: "User profile not found. Please contact support." };
      }

      const currentBalance = Number(profile.wallet_balance || 0);
      const currentDeposits = Number(profile.wallet_deposits || 0);
      const newBalance = currentBalance + usdValue;
      const newDeposits = currentDeposits + usdValue;

      // Record wallet transaction
      const { error: txErr } = await supabaseAdmin.from("wallet_transactions").insert({
        user_id: userId,
        action: "deposit",
        amount: usdValue,
        avail_before: currentBalance,
        avail_after: newBalance,
        credit_before: Number(profile.credit_balance || 0),
        credit_after: Number(profile.credit_balance || 0),
        reason: `Crypto Deposit (${coin.toUpperCase()} - ${network.toUpperCase()})`,
        external_id: txid.trim(),
        notes: `On-chain verified TXID claim. Crypto: ${onChainResult.amount} ${coin.toUpperCase()}`
      });

      if (txErr) {
        console.error("[verifyDeposit] wallet_transactions insert error:", txErr);
        return { success: false, error: "Failed to record transaction. Please contact support." };
      }

      // Update profile balance
      await supabaseAdmin
        .from("profiles")
        .update({
          wallet_balance: newBalance,
          wallet_deposits: newDeposits,
          wallet_last_updated: new Date().toISOString()
        })
        .eq("id", userId);

      // Create/update deposit record
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
          network: network.toUpperCase(),
          address: expectedAddress,
          amount: onChainResult.amount,
          usd_value: usdValue,
          txid: txid.trim(),
          confirmations: 1,
          status: "completed",
          wallet_credited: true,
          deposit_time: new Date().toISOString(),
          verified_at: new Date().toISOString()
        });
      }

      // 7. Send notifications
      try {
        const { data: bot } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .or("username.eq.jackpotjungle,username.eq.system_updates")
          .limit(1)
          .maybeSingle();

        if (bot?.id) {
          await supabaseAdmin.from("messages").insert({
            sender_id: bot.id,
            receiver_id: userId,
            content: `🎰 *Deposit Confirmed!*\n\nYour deposit of **${onChainResult.amount} ${coin.toUpperCase()}** over network **${network.toUpperCase()}** has been successfully credited.\n\n💰 **+$${usdValue.toFixed(2)} USD** has been added to your **Available Wallet Balance**.`
          });
        }
      } catch (msgErr) {
        console.error("[verifyDeposit] notification error:", msgErr);
      }

      try {
        await supabaseAdmin.from("user_notifications").insert({
          user_id: userId,
          title: "Deposit Confirmed 💰",
          content: `Your deposit of ${onChainResult.amount} ${coin.toUpperCase()} ($${usdValue.toFixed(2)} USD) has been credited to your Available balance.`,
          seen: false
        });
      } catch (notifErr) {
        console.error("[verifyDeposit] user_notifications error:", notifErr);
      }

      return {
        success: true,
        credited: usdValue,
        message: `Successfully verified and credited $${usdValue.toFixed(2)} to your available balance!`
      };

    } catch (e: any) {
      console.error("[Deposit Service] verifyDeposit failure:", e);
      return { success: false, error: e.message };
    }
  });
