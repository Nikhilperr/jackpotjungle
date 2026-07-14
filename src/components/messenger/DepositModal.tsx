import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Copy, Check, Loader2, X, RefreshCw, AlertTriangle, Info } from "lucide-react";
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
  networks: Array<{ id: string; name: string }>;
}

const CRYPTO_OPTIONS: CryptoOption[] = [
  {
    coin: "USDT",
    name: "Tether (USDT)",
    networks: [
      { id: "TRX", name: "TRON (TRC20)" },
      { id: "BSC", name: "BNB Smart Chain (BEP20)" },
      { id: "ETH", name: "Ethereum (ERC20)" }
    ]
  },
  {
    coin: "BTC",
    name: "Bitcoin (BTC)",
    networks: [
      { id: "BTC", name: "Bitcoin Mainnet" },
      { id: "BSC", name: "BNB Smart Chain (BEP20)" }
    ]
  },
  {
    coin: "ETH",
    name: "Ethereum (ETH)",
    networks: [
      { id: "ETH", name: "Ethereum (ERC20)" },
      { id: "BSC", name: "BNB Smart Chain (BEP20)" }
    ]
  },
  {
    coin: "BNB",
    name: "BNB (BNB)",
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
      const res = await getAddressFn({ coin, network });
      if (res.success && res.address) {
        setAddress(res.address);
        setTag(res.tag || null);
        setIsFallback(!!res.isFallback);
        
        // Generate QR code
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
      const res = await verifyFn({ coin: selectedCoin.coin });
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
      <DialogContent className="w-full max-w-md bg-card border border-border rounded-3xl shadow-2xl p-6 flex flex-col gap-4 text-foreground max-h-[90vh] overflow-y-auto [&>button]:hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h3 className="font-bold text-lg text-primary flex items-center gap-1.5">
              <span>Deposit with Crypto</span>
            </h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">Instant wallet credit on block confirmation</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full hover:bg-secondary flex items-center justify-center transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Currency & Network Selector */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase">Cryptocurrency</label>
            <select
              value={selectedCoin.coin}
              onChange={(e) => {
                const opt = CRYPTO_OPTIONS.find(c => c.coin === e.target.value)!;
                setSelectedCoin(opt);
                setSelectedNetwork(opt.networks[0]);
              }}
              className="w-full h-10 px-3 rounded-xl bg-secondary/80 border border-border text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {CRYPTO_OPTIONS.map(c => (
                <option key={c.coin} value={c.coin}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase">Network</label>
            <select
              value={selectedNetwork.id}
              onChange={(e) => {
                const net = selectedCoin.networks.find(n => n.id === e.target.value)!;
                setSelectedNetwork(net);
              }}
              className="w-full h-10 px-3 rounded-xl bg-secondary/80 border border-border text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {selectedCoin.networks.map(n => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Address and QR Code Display */}
        <div className="bg-background/40 border border-border/80 rounded-2xl p-5 flex flex-col items-center gap-4 relative min-h-[260px] justify-center">
          {loadingAddress ? (
            <div className="flex flex-col items-center justify-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">Requesting address...</span>
            </div>
          ) : (
            <>
              {/* QR Code */}
              {qrCodeUrl && (
                <div className="bg-white p-2.5 rounded-xl border border-border shadow-inner">
                  <img src={qrCodeUrl} alt="Deposit QR Code" className="h-36 w-36 object-contain" />
                </div>
              )}

              {/* Address Input Copy Box */}
              <div className="w-full space-y-1">
                <span className="text-[9px] font-bold text-muted-foreground uppercase text-center block">
                  Your Unique {selectedCoin.coin} Deposit Address
                </span>
                
                <div className="flex items-center gap-2 bg-secondary/70 border border-border/80 rounded-xl px-3 py-2.5 w-full relative">
                  <span className="text-xs font-mono font-bold break-all flex-1 select-all select-none leading-relaxed text-foreground select-text">
                    {address || "Fetching address..."}
                  </span>
                  <button
                    onClick={handleCopy}
                    disabled={!address}
                    className="h-8 w-8 rounded-lg flex items-center justify-center bg-background hover:bg-secondary border border-border shrink-0 transition-all text-muted-foreground hover:text-foreground"
                  >
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Tag / Memo if needed */}
              {tag && (
                <div className="w-full space-y-1">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase text-center block">
                    Required MEMO / TAG
                  </span>
                  <div className="flex items-center gap-2 bg-secondary/70 border border-border/80 rounded-xl px-3 py-2.5 w-full relative">
                    <span className="text-xs font-mono font-bold break-all flex-1 select-all leading-relaxed text-foreground select-text">
                      {tag}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(tag);
                        toast.success("MEMO/TAG copied.");
                      }}
                      className="h-8 w-8 rounded-lg flex items-center justify-center bg-background hover:bg-secondary border border-border shrink-0 transition-all text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Status Indicators */}
        {isFallback && !loadingAddress && (
          <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] p-3 rounded-xl flex gap-2 leading-relaxed">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              <strong>Demo Address Mode:</strong> Your platform is running in sandbox/testing mode. To enable automatic live deposits, please enable and link your Binance corporate Sub-account API Key inside your server configurations.
            </span>
          </div>
        )}

        <div className="bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] p-3 rounded-xl flex gap-2 leading-relaxed">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Send only {selectedCoin.coin} to this deposit address. Sending any other coin or using an incorrect blockchain network will result in permanent loss of your funds.
          </span>
        </div>

        {/* Footer Actions */}
        <div className="flex gap-3 pt-3 border-t border-border mt-1">
          <button
            onClick={onClose}
            disabled={verifying}
            className="flex-1 h-11 bg-secondary hover:bg-secondary/80 text-foreground font-semibold rounded-xl text-xs transition-colors border border-border"
          >
            Cancel
          </button>
          
          <button
            onClick={handleVerify}
            disabled={verifying || !address}
            className="flex-1 h-11 bg-primary text-primary-foreground font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 hover:opacity-90 disabled:opacity-50"
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
