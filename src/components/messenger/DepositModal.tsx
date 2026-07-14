import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Copy, Check, Loader2, X, RefreshCw, AlertTriangle, Info, Coins } from "lucide-react";
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
  logo: React.ReactNode;
  networks: Array<{ id: string; name: string }>;
}

// Vector SVG Coin Logos (Self-contained, fast, brand-accurate)
const UsdtLogo = () => (
  <svg className="h-7 w-7 transition-transform duration-300 group-hover:scale-110" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 24c6.627 0 12-5.373 12-12S18.627 0 12 0 0 5.373 0 12s5.373 12 12 12z" fill="#26A17B"/>
    <path d="M12.923 7.828v1.654h3.766v2.307h-3.766v4.945c0 .356.009.658.026.906.017.247.054.453.111.616.057.164.148.286.273.367.126.082.308.122.548.122.25 0 .506-.022.766-.067.26-.044.484-.108.67-.193l.363 2.056c-.326.126-.742.235-1.248.326a6.835 6.835 0 01-1.637.137c-.772 0-1.403-.105-1.895-.316a3.292 3.292 0 01-1.258-.934c-.326-.411-.532-.942-.619-1.593a12.87 12.87 0 01-.065-1.53V11.79H6.84V9.482h3.766V7.828H5.975V5.111h12.05v2.717h-5.102z" fill="#FFF"/>
  </svg>
);

const BtcLogo = () => (
  <svg className="h-7 w-7 transition-transform duration-300 group-hover:scale-110" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 24c6.627 0 12-5.373 12-12S18.627 0 12 0 0 5.373 0 12s5.373 12 12 12z" fill="#F7931A"/>
    <path d="M16.662 8.595c.252-1.693-.946-2.603-2.557-3.212l.523-2.095-1.277-.318-.508 2.04c-.335-.084-.68-.163-1.025-.243l.512-2.052-1.278-.318-.522 2.095c-.278-.063-.548-.125-.808-.19l.002-.008-1.763-.44-.34 1.365s.948.217.928.23c.517.13.773.474.753.748L8.71 11.233c.033.01.077.025.125.04-.04-.01-.087-.02-.132-.033l-1.072-.268-.663 2.658 1.65.412c.307.078.61.159.91.235l-.527 2.115 1.277.319.522-2.095c.348.096.685.185 1.015.268l-.51 2.049 1.278.318.528-2.113c2.179.412 3.818.246 4.509-1.725.556-1.587-.028-2.503-1.173-3.106.833-.193 1.46-.74 1.627-1.874zm-2.9 5.48c-.395 1.587-3.07.73-3.938.514l.703-2.822c.868.217 3.633.645 3.235 2.308zm.395-5.509c-.36 1.447-2.587.712-3.31.531l.638-2.557c.722.18 3.036.516 2.672 2.026z" fill="#FFF"/>
  </svg>
);

const EthLogo = () => (
  <svg className="h-7 w-7 transition-transform duration-300 group-hover:scale-110" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 24c6.627 0 12-5.373 12-12S18.627 0 12 0 0 5.373 0 12s5.373 12 12 12z" fill="#627EEA"/>
    <path d="M12 2.25l-5.625 9.313L12 15l5.625-3.438L12 2.25z" fill="#FFF" fillOpacity=".6"/>
    <path d="M12 2.25v9.313h5.625L12 2.25z" fill="#FFF" fillOpacity=".8"/>
    <path d="M12 16.125l-5.625-3.187L12 21.75l5.625-8.812-5.625 3.187z" fill="#FFF" fillOpacity=".6"/>
    <path d="M12 16.125v5.625l5.625-8.812-5.625 3.187z" fill="#FFF" fillOpacity=".8"/>
    <path d="M6.375 11.563L12 15l5.625-3.438L12 8.25l-5.625 3.313z" fill="#FFF" fillOpacity=".2"/>
  </svg>
);

const BnbLogo = () => (
  <svg className="h-7 w-7 transition-transform duration-300 group-hover:scale-110" viewBox="0 0 24 24" fill="currentColor">
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
      { id: "TRX", name: "TRON (TRC20)" },
      { id: "BSC", name: "BNB Smart Chain (BEP20)" },
      { id: "ETH", name: "Ethereum (ERC20)" }
    ]
  },
  {
    coin: "BTC",
    name: "Bitcoin",
    color: "from-amber-500 to-orange-600",
    logo: <BtcLogo />,
    networks: [
      { id: "BTC", name: "Bitcoin Mainnet" },
      { id: "BSC", name: "BNB Smart Chain (BEP20)" }
    ]
  },
  {
    coin: "ETH",
    name: "Ethereum",
    color: "from-indigo-500 to-purple-600",
    logo: <EthLogo />,
    networks: [
      { id: "ETH", name: "Ethereum (ERC20)" },
      { id: "BSC", name: "BNB Smart Chain (BEP20)" }
    ]
  },
  {
    coin: "BNB",
    name: "BNB",
    color: "from-yellow-400 to-amber-500",
    logo: <BnbLogo />,
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
      <DialogContent className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl p-6 flex flex-col gap-5 text-white max-h-[90vh] overflow-y-auto [&>button]:hidden select-none">
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
                      ? "bg-zinc-900 border-primary/80 shadow-lg shadow-primary/5"
                      : "bg-zinc-900/40 border-zinc-800/80 hover:bg-zinc-900 hover:border-zinc-700"
                  }`}
                >
                  {/* Colored indicator background line */}
                  <div className={`absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r ${c.color} transform origin-left transition-transform duration-300 ${isActive ? "scale-x-100" : "scale-x-0 group-hover:scale-x-50"}`} />

                  {/* Coin Brand SVG Icon */}
                  <div className="mb-2 shrink-0">
                    {c.logo}
                  </div>

                  <span className={`text-xs font-black tracking-tight ${isActive ? "text-primary" : "text-zinc-300"}`}>
                    {c.coin}
                  </span>
                  <span className="text-[8px] text-zinc-500 font-bold truncate mt-0.5 w-full text-center">
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
        <div className="bg-zinc-950/80 border border-zinc-800/90 rounded-3xl p-5 flex flex-col items-center gap-4 relative min-h-[240px] justify-center shadow-inner">
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
                  <img src={qrCodeUrl} alt="Deposit QR Code" className="h-28 w-28 object-contain" />
                </div>
              )}

              {/* Address Field copy box */}
              <div className="w-full space-y-1.5">
                <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest text-center block">
                  Your Unique {selectedCoin.coin} Deposit Address
                </span>
                
                <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800/90 rounded-2xl px-3 py-2 w-full">
                  <span className="text-xs font-mono font-bold break-all flex-1 text-zinc-200 select-all leading-relaxed text-left pl-1">
                    {address || "Fetching address..."}
                  </span>
                  <button
                    onClick={handleCopy}
                    disabled={!address}
                    className="h-8 w-8 rounded-xl flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all duration-200 border border-zinc-700/60 shrink-0"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {/* Tag / Memo if needed */}
              {tag && (
                <div className="w-full space-y-1.5 mt-0.5">
                  <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest text-center block">
                    Required MEMO / TAG
                  </span>
                  <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800/90 rounded-2xl px-3 py-2 w-full">
                    <span className="text-xs font-mono font-bold break-all flex-1 text-zinc-200 select-all text-left pl-1">
                      {tag}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(tag);
                        toast.success("MEMO/TAG copied.");
                      }}
                      className="h-8 w-8 rounded-xl flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all duration-200 border border-zinc-700/60 shrink-0"
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
