import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Copy, Check, Loader2, X, RefreshCw, AlertTriangle, Info, Coins, ShieldCheck } from "lucide-react";
import QRCode from "qrcode";
import { getDepositAddress, verifyDeposit } from "@/lib/deposit.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

interface DepositModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (creditedAmount: number) => void;
}

interface CryptoOption {
  coin: string;
  name: string;
  color: string;
  networks: Array<{ id: string; name: string }>;
}

const CRYPTO_OPTIONS: CryptoOption[] = [
  {
    coin: "USDT",
    name: "Tether",
    color: "from-emerald-500 to-teal-600",
    networks: [
      { id: "TRX", name: "TRON (TRC20)" },
      { id: "BSC", name: "BNB Smart Chain (BEP20)" },
      { id: "ETH", name: "Ethereum (ERC20)" }
    ]
  },
  {
    coin: "BTC",
    name: "Bitcoin",
    color: "from-amber-500 to-orange-600",
    networks: [
      { id: "BTC", name: "Bitcoin Mainnet" },
      { id: "BSC", name: "BNB Smart Chain (BEP20)" }
    ]
  },
  {
    coin: "ETH",
    name: "Ethereum",
    color: "from-indigo-500 to-purple-600",
    networks: [
      { id: "ETH", name: "Ethereum (ERC20)" },
      { id: "BSC", name: "BNB Smart Chain (BEP20)" }
    ]
  },
  {
    coin: "BNB",
    name: "BNB",
    color: "from-yellow-400 to-amber-500",
    networks: [
      { id: "BSC", name: "BNB Smart Chain (BEP20)" }
    ]
  }
];

export function DepositModal({ open, onClose, onSuccess }: DepositModalProps) {
  const getAddressFn = useServerFn(getDepositAddress);
  const verifyFn = useServerFn(verifyDeposit);

  const [selectedCoin, setSelectedCoin] = useState<CryptoOption>(CRYPTO_OPTIONS[0]);
  const [selectedNetwork, setSelectedNetwork] = useState(CRYPTO_OPTIONS[0].networks[0]);

  const [address, setAddress] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [loadingAddress, setLoadingAddress] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [isFallback, setIsFallback] = useState(false);

  // Verifying state
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (open) {
      loadAddress(selectedCoin.coin, selectedNetwork.id);
    }
  }, [open, selectedCoin, selectedNetwork]);

  const loadAddress = async (coin: string, network: string) => {
    setLoadingAddress(true);
    setAddress("");
    setTag(null);
    setQrCodeUrl("");
    try {
      // Fix Zod validation error by wrapping arguments in the required 'data' object
      const res = await getAddressFn({ data: { coin, network } });
      if (res.success && res.address) {
        setAddress(res.address);
        setTag(res.tag || null);
        setIsFallback(!!res.isFallback);
        
        // Generate QR code with customized border margins
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
      // Fix Zod validation error by wrapping arguments in the required 'data' object
      const res = await verifyFn({ data: { coin: selectedCoin.coin } });
      if (res.success) {
        if (res.credited && res.credited > 0) {
          toast.success(res.message);
          if (onSuccess) {
            onSuccess(res.credited);
          }
          onClose();
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

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) onClose(); }}>
      <DialogContent className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl p-6 flex flex-col gap-5 text-white max-h-[90vh] overflow-y-auto [&>button]:hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-center text-primary">
              <Coins className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-base bg-gradient-to-r from-primary to-orange-400 bg-clip-text text-transparent">
                Deposit with Crypto
              </h3>
              <p className="text-[10px] text-zinc-400 font-medium">Instant wallet credits on block confirmation</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="h-8 w-8 rounded-full bg-zinc-900 border border-zinc-800 hover:bg-zinc-850 hover:text-red-400 flex items-center justify-center transition-all duration-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Currency Card Grid Selection */}
        <div className="space-y-2">
          <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block">Select Cryptocurrency</label>
          <div className="grid grid-cols-4 gap-2">
            {CRYPTO_OPTIONS.map((c) => {
              const isActive = selectedCoin.coin === c.coin;
              return (
                <button
                  key={c.coin}
                  onClick={() => {
                    setSelectedCoin(c);
                    setSelectedNetwork(c.networks[0]);
                  }}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border transition-all duration-300 relative overflow-hidden group ${
                    isActive
                      ? "bg-zinc-900 border-primary shadow-lg shadow-primary/5"
                      : "bg-zinc-900/40 border-zinc-800/80 hover:bg-zinc-900 hover:border-zinc-700"
                  }`}
                >
                  {/* Colored indicator background line */}
                  <div className={`absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r ${c.color} transform origin-left transition-transform duration-300 ${isActive ? "scale-x-100" : "scale-x-0 group-hover:scale-x-50"}`} />

                  <span className={`text-xs font-black tracking-tight ${isActive ? "text-primary" : "text-zinc-300"}`}>
                    {c.coin}
                  </span>
                  <span className="text-[8px] text-zinc-500 font-bold truncate mt-1 w-full text-center">
                    {c.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Network Pill Selection */}
        <div className="space-y-2">
          <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block">Select Network</label>
          <div className="flex flex-wrap gap-2">
            {selectedCoin.networks.map((n) => {
              const isActive = selectedNetwork.id === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => setSelectedNetwork(n)}
                  className={`px-3.5 py-1.5 rounded-full border text-[10px] font-black uppercase transition-all duration-300 ${
                    isActive
                      ? "bg-primary text-primary-foreground border-transparent shadow-md"
                      : "bg-zinc-900/50 border-zinc-800/85 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 hover:border-zinc-700"
                  }`}
                >
                  {n.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Floating Glassmorphic Address Container */}
        <div className="bg-zinc-950/80 border border-zinc-800/90 rounded-3xl p-5 flex flex-col items-center gap-4 relative min-h-[250px] justify-center shadow-inner">
          {loadingAddress ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Requesting address...</span>
            </div>
          ) : (
            <>
              {/* QR Code Card */}
              {qrCodeUrl && (
                <div className="bg-white p-2 rounded-2xl shadow-xl transition-transform duration-300 hover:scale-105 select-none">
                  <img src={qrCodeUrl} alt="Deposit QR Code" className="h-32 w-32 object-contain" />
                </div>
              )}

              {/* Address Field copy box */}
              <div className="w-full space-y-1.5">
                <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest text-center block">
                  Your Unique {selectedCoin.coin} Deposit Address
                </span>
                
                <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800/90 rounded-2xl px-3 py-2.5 w-full">
                  <span className="text-xs font-mono font-bold break-all flex-1 text-zinc-200 select-all leading-relaxed text-left pl-1">
                    {address || "Fetching address..."}
                  </span>
                  <button
                    onClick={handleCopy}
                    disabled={!address}
                    className="h-8 w-8 rounded-xl flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all duration-200 border border-zinc-700/60"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {/* Tag / Memo if needed */}
              {tag && (
                <div className="w-full space-y-1.5 mt-1">
                  <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest text-center block">
                    Required MEMO / TAG
                  </span>
                  <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800/90 rounded-2xl px-3 py-2.5 w-full">
                    <span className="text-xs font-mono font-bold break-all flex-1 text-zinc-200 select-all text-left pl-1">
                      {tag}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(tag);
                        toast.success("MEMO/TAG copied.");
                      }}
                      className="h-8 w-8 rounded-xl flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all duration-200 border border-zinc-700/60"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Notices */}
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

        {/* Modal Buttons Footer */}
        <div className="flex gap-3 pt-3 border-t border-zinc-850 mt-1">
          <button
            onClick={onClose}
            disabled={verifying}
            className="flex-1 h-11 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white font-bold rounded-2xl text-xs transition-colors border border-zinc-800"
          >
            Cancel
          </button>
          
          <button
            onClick={handleVerify}
            disabled={verifying || !address}
            className="flex-1 h-11 bg-gradient-to-r from-primary to-orange-500 hover:brightness-110 text-white font-black rounded-2xl text-xs transition-all flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
          >
            {verifying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            <span>Verify Deposit</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
