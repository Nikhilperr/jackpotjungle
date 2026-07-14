import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, HamburgerButton } from "@/components/messenger/AppShell";
import { toast } from "sonner";
import { ChevronLeft, RefreshCw, Copy, Check, Loader2, Info, Coins, AlertTriangle, ArrowRight, History } from "lucide-react";
import { getDepositAddress, verifyDeposit } from "@/lib/deposit.functions";
import { useServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/app/_authenticated/deposit")({
  ssr: false,
  head: () => ({ meta: [{ title: "Deposit with Crypto — JJ Messenger" }] }),
  component: DepositPage,
});

interface NetworkSpec {
  id: string;
  name: string;
  minDeposit: string;
  confirmations: number;
  arrivalEst: string;
}

interface CryptoOption {
  coin: string;
  name: string;
  color: string;
  logo: React.ReactNode;
  networks: NetworkSpec[];
}

// Vector SVG Coin Logos (Self-contained, fast, brand-accurate)
const UsdtLogo = () => (
  <svg className="h-8 w-8 transition-transform duration-300 group-hover:scale-110" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 24c6.627 0 12-5.373 12-12S18.627 0 12 0 0 5.373 0 12s5.373 12 12 12z" fill="#26A17B"/>
    <path d="M12.923 7.828v1.654h3.766v2.307h-3.766v4.945c0 .356.009.658.026.906.017.247.054.453.111.616.057.164.148.286.273.367.126.082.308.122.548.122.25 0 .506-.022.766-.067.26-.044.484-.108.67-.193l.363 2.056c-.326.126-.742.235-1.248.326a6.835 6.835 0 01-1.637.137c-.772 0-1.403-.105-1.895-.316a3.292 3.292 0 01-1.258-.934c-.326-.411-.532-.942-.619-1.593a12.87 12.87 0 01-.065-1.53V11.79H6.84V9.482h3.766V7.828H5.975V5.111h12.05v2.717h-5.102z" fill="#FFF"/>
  </svg>
);

const BtcLogo = () => (
  <svg className="h-8 w-8 transition-transform duration-300 group-hover:scale-110" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 24c6.627 0 12-5.373 12-12S18.627 0 12 0 0 5.373 0 12s5.373 12 12 12z" fill="#F7931A"/>
    <path d="M16.662 8.595c.252-1.693-.946-2.603-2.557-3.212l.523-2.095-1.277-.318-.508 2.04c-.335-.084-.68-.163-1.025-.243l.512-2.052-1.278-.318-.522 2.095c-.278-.063-.548-.125-.808-.19l.002-.008-1.763-.44-.34 1.365s.948.217.928.23c.517.13.773.474.753.748L8.71 11.233c.033.01.077.025.125.04-.04-.01-.087-.02-.132-.033l-1.072-.268-.663 2.658 1.65.412c.307.078.61.159.91.235l-.527 2.115 1.277.319.522-2.095c.348.096.685.185 1.015.268l-.51 2.049 1.278.318.528-2.113c2.179.412 3.818.246 4.509-1.725.556-1.587-.028-2.503-1.173-3.106.833-.193 1.46-.74 1.627-1.874zm-2.9 5.48c-.395 1.587-3.07.73-3.938.514l.703-2.822c.868.217 3.633.645 3.235 2.308zm.395-5.509c-.36 1.447-2.587.712-3.31.531l.638-2.557c.722.18 3.036.516 2.672 2.026z" fill="#FFF"/>
  </svg>
);

const EthLogo = () => (
  <svg className="h-8 w-8 transition-transform duration-300 group-hover:scale-110" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 24c6.627 0 12-5.373 12-12S18.627 0 12 0 0 5.373 0 12s5.373 12 12 12z" fill="#627EEA"/>
    <path d="M12 2.25l-5.625 9.313L12 15l5.625-3.438L12 2.25z" fill="#FFF" fillOpacity=".6"/>
    <path d="M12 2.25v9.313h5.625L12 2.25z" fill="#FFF" fillOpacity=".8"/>
    <path d="M12 16.125l-5.625-3.187L12 21.75l5.625-8.812-5.625 3.187z" fill="#FFF" fillOpacity=".6"/>
    <path d="M12 16.125v5.625l5.625-8.812-5.625 3.187z" fill="#FFF" fillOpacity=".8"/>
    <path d="M6.375 11.563L12 15l5.625-3.438L12 8.25l-5.625 3.313z" fill="#FFF" fillOpacity=".2"/>
  </svg>
);

const BnbLogo = () => (
  <svg className="h-8 w-8 transition-transform duration-300 group-hover:scale-110" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 24c6.627 0 12-5.373 12-12S18.627 0 12 0 0 5.373 0 12s5.373 12 12 12z" fill="#F3BA2F"/>
    <path d="M12.001 7.151l2.585 2.587 1.83-1.83-4.415-4.415-4.415 4.415 1.83 1.83 2.585-2.587zm5.174 5.176l1.83 1.83 2.583-2.584-4.413-4.415-1.83 1.83 1.83 1.839zm-10.347 0l1.83-1.83-1.83-1.839-1.83 1.83-2.583 2.584 4.413 4.415zm5.173 5.174l-2.585-2.587-1.83 1.83 4.415 4.415 4.415-4.415-1.83-1.83-2.585 2.587zm2.588-2.587l2.586-2.587-2.586-2.587-2.588 2.587 2.588 2.587z" fill="#FFF"/>
  </svg>
);

const CRYPTO_OPTIONS: CryptoOption[] = [
  {
    coin: "USDT",
    name: "Tether",
    color: "from-emerald-500 to-teal-600",
    logo: <UsdtLogo />,
    networks: [
      { id: "TRX", name: "TRON (TRC20)", minDeposit: "10.00 USDT", confirmations: 1, arrivalEst: "~2 mins" },
      { id: "BSC", name: "BNB Smart Chain (BEP20)", minDeposit: "10.00 USDT", confirmations: 15, arrivalEst: "~3 mins" },
      { id: "ETH", name: "Ethereum (ERC20)", minDeposit: "10.00 USDT", confirmations: 30, arrivalEst: "~5 mins" }
    ]
  },
  {
    coin: "BTC",
    name: "Bitcoin",
    color: "from-amber-500 to-orange-600",
    logo: <BtcLogo />,
    networks: [
      { id: "BTC", name: "Bitcoin Mainnet", minDeposit: "0.0001 BTC", confirmations: 2, arrivalEst: "~10 mins" },
      { id: "BSC", name: "BNB Smart Chain (BEP20)", minDeposit: "0.0001 BTC", confirmations: 15, arrivalEst: "~3 mins" }
    ]
  },
  {
    coin: "ETH",
    name: "Ethereum",
    color: "from-indigo-500 to-purple-600",
    logo: <EthLogo />,
    networks: [
      { id: "ETH", name: "Ethereum (ERC20)", minDeposit: "0.005 ETH", confirmations: 30, arrivalEst: "~5 mins" },
      { id: "BSC", name: "BNB Smart Chain (BEP20)", minDeposit: "0.005 ETH", confirmations: 15, arrivalEst: "~3 mins" }
    ]
  },
  {
    coin: "BNB",
    name: "BNB",
    color: "from-yellow-400 to-amber-500",
    logo: <BnbLogo />,
    networks: [
      { id: "BSC", name: "BNB Smart Chain (BEP20)", minDeposit: "0.01 BNB", confirmations: 15, arrivalEst: "~3 mins" }
    ]
  }
];

function DepositPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const getAddressFn = useServerFn(getDepositAddress);
  const verifyFn = useServerFn(verifyDeposit);

  const [selectedCoin, setSelectedCoin] = useState<CryptoOption>(CRYPTO_OPTIONS[0]);
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkSpec>(CRYPTO_OPTIONS[0].networks[0]);

  const [address, setAddress] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [loadingAddress, setLoadingAddress] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [isFallback, setIsFallback] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  // Live status states
  const [latestDeposit, setLatestDeposit] = useState<any>(null);

  useEffect(() => {
    if (user?.id) {
      loadAddress(selectedCoin.coin, selectedNetwork.id);
      fetchHistory();
    }
  }, [user?.id, selectedCoin, selectedNetwork]);

  // Real-time Postgres subscription to update deposit status instantly
  useEffect(() => {
    if (!user?.id) return;

    fetchLatestDepositStatus();

    const channel = supabase
      .channel(`crypto-deposits-realtime-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "crypto_deposits",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchLatestDepositStatus();
          fetchHistory();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [user?.id]);

  // High-frequency auto-verify while on this page
  useEffect(() => {
    if (!address || verifying) return;
    
    const interval = setInterval(async () => {
      try {
        const res = await verifyFn({ data: { coin: selectedCoin.coin } });
        if (res.success && res.credited && res.credited > 0) {
          toast.success(`Deposit Confirmed! $${res.credited.toFixed(2)} has been credited to your available balance.`);
          window.dispatchEvent(new CustomEvent("wallet-updated"));
          fetchHistory();
        }
      } catch (e) {
        console.warn("[Deposit Page] Auto-verify cycle failed:", e);
      }
    }, 15000); // Check every 15s

    return () => clearInterval(interval);
  }, [address, selectedCoin, verifyFn, verifying]);

  const loadAddress = async (coin: string, network: string) => {
    setLoadingAddress(true);
    setAddress("");
    setTag(null);
    setQrCodeUrl("");
    try {
      const res = await getAddressFn({ data: { coin, network } });
      if (res.success && res.address) {
        setAddress(res.address);
        setTag(res.tag || null);
        setIsFallback(!!res.isFallback);
        
        // Generate QR code safely only when coordinates change
        const qrUrl = await QRCode.toDataURL(res.address, { margin: 1, scale: 6 });
        setQrCodeUrl(qrUrl);
      } else {
        toast.error(res.error || "Failed to load deposit address.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to query server for address.");
    } finally {
      setLoadingAddress(false);
    }
  };

  const fetchLatestDepositStatus = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from("crypto_deposits")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setLatestDeposit(data || null);
  };

  const fetchHistory = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from("crypto_deposits")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);
    setHistory(data ?? []);
  };

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    toast.success("Deposit address copied to clipboard.");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const res = await verifyFn({ data: { coin: selectedCoin.coin } });
      if (res.success) {
        if (res.credited && res.credited > 0) {
          toast.success(res.message);
          window.dispatchEvent(new CustomEvent("wallet-updated"));
          fetchHistory();
        } else {
          toast.info(res.message);
        }
      } else {
        toast.error(res.error || "Verification failed.");
      }
    } catch (err: any) {
      toast.error(err.message || "Verification request failed.");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <AppShell>
      <div className="h-full flex flex-col overflow-y-auto bg-background text-foreground select-none">
        
        {/* Header Bar */}
        <div className="p-4 border-b border-border flex items-center justify-between shrink-0 bg-card select-none">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate({ to: "/app/chat" })}
              className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors py-1 px-2.5 rounded-lg hover:bg-secondary/80 border border-border/50"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Back</span>
            </button>
            <div className="border-l border-border h-5 mx-1" />
            <h1 className="font-black text-lg bg-gradient-to-r from-primary to-orange-400 bg-clip-text text-transparent flex items-center gap-2">
              <Coins className="h-5 w-5 animate-pulse text-primary" />
              <span>Deposit Crypto</span>
            </h1>
          </div>

          <button
            onClick={() => loadAddress(selectedCoin.coin, selectedNetwork.id)}
            disabled={loadingAddress}
            className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-all duration-200 py-1.5 px-3 rounded-lg border border-border/60 hover:bg-secondary/60 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingAddress ? "animate-spin text-primary" : ""}`} />
            <span>Refresh Address</span>
          </button>
        </div>

        {/* Responsive Content Grid */}
        <div className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-8 grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          
          {/* Left Column (Selector & Address QR Box) */}
          <div className="md:col-span-7 space-y-6 w-full">
            
            {/* Cryptocurrency Selector */}
            <div className="bg-card border border-border/80 rounded-3xl p-5 shadow-sm space-y-4">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Select Cryptocurrency</label>
              <div className="grid grid-cols-4 gap-2.5">
                {CRYPTO_OPTIONS.map((c) => {
                  const isActive = selectedCoin.coin === c.coin;
                  return (
                    <button
                      key={c.coin}
                      onClick={() => {
                        setSelectedCoin(c);
                        setSelectedNetwork(c.networks[0]);
                      }}
                      className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all duration-300 relative overflow-hidden group ${
                        isActive
                          ? "bg-zinc-900 border-primary/80 shadow-md shadow-primary/5 text-foreground"
                          : "bg-zinc-900/30 border-border/60 hover:bg-zinc-900 hover:border-zinc-800 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <div className={`absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r ${c.color} transform origin-left transition-transform duration-300 ${isActive ? "scale-x-100" : "scale-x-0 group-hover:scale-x-50"}`} />
                      <div className="mb-2 shrink-0">{c.logo}</div>
                      <span className={`text-sm font-black tracking-tight ${isActive ? "text-primary" : ""}`}>{c.coin}</span>
                      <span className="text-[9px] text-zinc-500 font-bold truncate mt-0.5 w-full text-center">{c.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Network Selector */}
            <div className="bg-card border border-border/80 rounded-3xl p-5 shadow-sm space-y-4">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Select Network</label>
              <div className="flex flex-wrap gap-2.5">
                {selectedCoin.networks.map((n) => {
                  const isActive = selectedNetwork.id === n.id;
                  return (
                    <button
                      key={n.id}
                      onClick={() => setSelectedNetwork(n)}
                      className={`px-4.5 py-2.5 rounded-xl border text-[11px] font-black uppercase transition-all duration-300 ${
                        isActive
                          ? "bg-primary text-primary-foreground border-transparent shadow-md"
                          : "bg-zinc-900/30 border-border/60 text-muted-foreground hover:text-foreground hover:bg-zinc-900 hover:border-zinc-800"
                      }`}
                    >
                      {n.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Interactive QR and Copy Box */}
            <div className="bg-card border border-border/80 rounded-3xl p-6 shadow-sm flex flex-col items-center gap-5 justify-center min-h-[250px]">
              {loadingAddress ? (
                <div className="flex flex-col items-center justify-center gap-3 py-10">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="text-[11px] text-muted-foreground font-black uppercase tracking-wider">Generating Address...</span>
                </div>
              ) : (
                <>
                  {/* Generated QR Box */}
                  {qrCodeUrl && (
                    <div className="bg-white p-3 rounded-2xl shadow-md transition-transform duration-300 hover:scale-105 select-none">
                      <img src={qrCodeUrl} alt="Deposit QR Code" className="h-36 w-36 object-contain" />
                    </div>
                  )}

                  {/* Copy Address field */}
                  <div className="w-full space-y-2">
                    <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest text-center block">
                      Your Unique {selectedCoin.coin} Deposit Address
                    </span>
                    
                    <div className="flex items-center gap-2 bg-zinc-900 border border-border/80 rounded-2xl px-4 py-3 w-full">
                      <span className="text-xs font-mono font-bold break-all flex-1 text-zinc-200 select-all leading-relaxed text-left pl-1">
                        {address || "Fetching address..."}
                      </span>
                      <button
                        onClick={handleCopy}
                        disabled={!address}
                        className="h-10 w-10 rounded-xl flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all duration-200 border border-zinc-700/60 shrink-0"
                      >
                        {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* TAG / MEMO */}
                  {tag && (
                    <div className="w-full space-y-2">
                      <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest text-center block">
                        Required MEMO / TAG
                      </span>
                      <div className="flex items-center gap-2 bg-zinc-900 border border-border/80 rounded-2xl px-4 py-3 w-full">
                        <span className="text-xs font-mono font-bold break-all flex-1 text-zinc-200 select-all text-left pl-1">
                          {tag}
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(tag);
                            toast.success("MEMO/TAG copied.");
                          }}
                          className="h-10 w-10 rounded-xl flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all duration-200 border border-zinc-700/60 shrink-0"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

          </div>

          {/* Right Column (Specs, Status Card, Warnings & History Preview) */}
          <div className="md:col-span-5 space-y-6 w-full">
            
            {/* Live Status Card */}
            <div className="bg-card border border-border/80 rounded-3xl p-5 shadow-sm space-y-4">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Live Status Section</label>
              
              {(() => {
                const status = latestDeposit?.status || "waiting";
                let statusTitle = "Waiting for Deposit";
                let statusDesc = "Send cryptocurrency to the unique address to initiate transaction.";
                let badgeClass = "bg-muted-foreground/15 text-muted-foreground border-muted-foreground/20";
                
                if (status === "pending") {
                  statusTitle = "Transaction Detected";
                  statusDesc = "Validating blockchain block confirmations in the background.";
                  badgeClass = "bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse";
                } else if (status === "completed") {
                  statusTitle = "Credited Successfully";
                  statusDesc = `Successfully credited +$${Number(latestDeposit.usd_value).toFixed(2)} to Available Wallet Balance.`;
                  badgeClass = "bg-green-500/10 text-green-500 border-green-500/20";
                }

                return (
                  <div className="p-4 bg-zinc-900/40 border border-border/60 rounded-2xl flex flex-col gap-2 relative overflow-hidden select-none">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-foreground">{statusTitle}</span>
                      <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border ${badgeClass}`}>
                        {status.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-normal">{statusDesc}</p>
                    {status === "pending" && (
                      <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden mt-1">
                        <div className="bg-amber-500 h-full rounded-full w-1/3 animate-infinite-loading" />
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Network Specifications Card */}
            {!loadingAddress && address && (
              <div className="bg-card border border-border/80 rounded-3xl p-5 shadow-sm space-y-3 text-xs">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1">Network Specifications</label>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-semibold text-[11px] uppercase tracking-wide">Minimum Deposit</span>
                  <span className="font-extrabold text-foreground">{selectedNetwork.minDeposit}</span>
                </div>
                <div className="flex justify-between items-center pt-2.5 border-t border-border/45">
                  <span className="text-muted-foreground font-semibold text-[11px] uppercase tracking-wide">Expected Arrival</span>
                  <span className="font-extrabold text-foreground">{selectedNetwork.arrivalEst}</span>
                </div>
                <div className="flex justify-between items-center pt-2.5 border-t border-border/45">
                  <span className="text-muted-foreground font-semibold text-[11px] uppercase tracking-wide">Required Confirmations</span>
                  <span className="font-extrabold text-foreground">{selectedNetwork.confirmations} Block Confirmations</span>
                </div>
              </div>
            )}

            {/* Warnings Container */}
            <div className="space-y-3">
              {isFallback && !loadingAddress && (
                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] p-3 rounded-2xl flex gap-2.5 leading-relaxed">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    <strong>Testing Address:</strong> Platform running in developer mode. To enable actual deposits, connect your Binance corporate API credentials.
                  </span>
                </div>
              )}

              <div className="bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] p-3 rounded-2xl flex gap-2.5 leading-relaxed">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Send only {selectedCoin.coin} to this deposit address. Sending any other coin or selecting a mismatched blockchain network will cause permanent loss of funds.
                </span>
              </div>
            </div>

            {/* Verify Action Button */}
            <button
              onClick={handleVerify}
              disabled={verifying || !address}
              className="w-full h-12 bg-gradient-to-r from-primary to-orange-500 hover:brightness-110 text-white font-black rounded-2xl text-xs transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 shadow-md shadow-primary/10 select-none"
            >
              {verifying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span>I've Sent Deposit</span>
            </button>

          </div>
        </div>

        {/* Deposit History Preview Section */}
        <div className="border-t border-border mt-auto bg-card select-none shrink-0">
          <div className="max-w-6xl w-full mx-auto p-4 md:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-4.5 w-4.5 text-primary" />
                <h3 className="font-black text-sm uppercase tracking-wider">Deposit History Preview</h3>
              </div>
              <Link
                to="/app/wallet"
                className="text-xs font-bold text-primary hover:underline flex items-center gap-0.5 cursor-pointer"
              >
                <span>View Full History</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="overflow-x-auto w-full border border-border/80 rounded-2xl bg-secondary/10">
              {history.length === 0 ? (
                <p className="p-6 text-center text-xs text-muted-foreground font-semibold">No crypto deposits recorded yet.</p>
              ) : (
                <table className="w-full text-left border-collapse text-xs select-none">
                  <thead>
                    <tr className="border-b border-border/80 bg-secondary/35 text-muted-foreground font-bold">
                      <th className="p-3">Coin / Net</th>
                      <th className="p-3 text-right">Crypto Amount</th>
                      <th className="p-3 text-right">USD Equivalent</th>
                      <th className="p-3">Transaction ID (TXID)</th>
                      <th className="p-3">Deposit Time</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id} className="border-b border-border/40 hover:bg-secondary/20">
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-bold uppercase text-foreground">
                            {h.coin} · {h.network}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-foreground">
                          {h.amount}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-green-600">
                          ${Number(h.usd_value).toFixed(2)}
                        </td>
                        <td className="p-3 font-mono text-[10px] max-w-[150px] truncate select-all" title={h.txid}>
                          {h.txid}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {new Date(h.deposit_time).toLocaleString()}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            h.status === "completed" ? "bg-green-500/10 text-green-500" : "bg-amber-500/10 text-amber-500"
                          }`}>
                            {h.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

      </div>
    </AppShell>
  );
}
