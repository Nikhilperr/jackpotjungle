import { createFileRoute } from "@tanstack/react-router";
import { AppShell, HamburgerButton } from "@/components/messenger/AppShell";
import { HelpCircle, MessageSquare, Send, ArrowUpRight, Loader2, Sparkles, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSupportLinks } from "@/lib/admin-super.functions";

export const Route = createFileRoute("/app/_authenticated/support")({
  ssr: false,
  head: () => ({ meta: [{ title: "Help & Support — JJ Messenger" }] }),
  component: HelpSupportPage,
});

function HelpSupportPage() {
  const getLinksFn = useServerFn(getSupportLinks);
  const [whatsappUrl, setWhatsappUrl] = useState("https://chat.whatsapp.com/BRtQ4NFSgVGLE9t5sF7ETr");
  const [telegramUrl, setTelegramUrl] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getLinksFn()
      .then((res) => {
        if (!mounted || !res.success || !res.links) return;
        const wa = res.links.find((l: any) => l.id === "whatsapp")?.url || "";
        const tg = res.links.find((l: any) => l.id === "telegram")?.url || "";
        setWhatsappUrl(wa);
        setTelegramUrl(tg);
      })
      .catch((err) => console.warn("Failed to load dynamic support links:", err))
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [getLinksFn]);

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        {/* Page Header */}
        <div className="p-3 border-b border-border flex items-center gap-2">
          <HamburgerButton />
          <h1 className="font-bold flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            <span>Help & Support</span>
          </h1>
        </div>

        {/* Page Body */}
        <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6 animate-in fade-in duration-300">
          
          {/* Main Hero Card */}
          <div className="rounded-3xl bg-gradient-to-br from-primary/20 via-purple-600/10 to-amber-500/10 border border-border/80 p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden shadow-lg select-none">
            <div className="space-y-3 max-w-xl text-left">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-primary/20 text-primary border border-primary/30 tracking-widest inline-block">
                Host Assistance
              </span>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
                Get Dynamic Support Channel Access
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Connect with our social casino hosts on WhatsApp or Telegram to resolve wallet issues, redeem milestone codes, or report bugs.
              </p>
            </div>
            <div className="h-20 w-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 shadow-inner">
              <MessageSquare className="h-10 w-10 animate-pulse" />
            </div>
          </div>

          {/* Dynamic Links Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* WhatsApp Card */}
            <div className="bg-card border border-border/60 rounded-3xl p-5 shadow-sm flex flex-col justify-between h-48 hover:border-primary/30 transition-all text-left">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="h-9 w-9 bg-emerald-500/10 text-emerald-500 rounded-xl flex items-center justify-center font-bold">
                    WA
                  </div>
                  <span className="text-[9px] font-black tracking-widest uppercase text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                    Active Support
                  </span>
                </div>
                <h3 className="font-extrabold text-base text-foreground">WhatsApp Group Support</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Join our official WhatsApp group server to claim daily bonuses and chat directly with casino host managers.
                </p>
              </div>

              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : whatsappUrl ? (
                <a 
                  href={whatsappUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/10 transition-colors"
                >
                  <span>Join WhatsApp Chat</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              ) : (
                <Button disabled className="w-full rounded-xl font-bold text-xs h-11">
                  Offline
                </Button>
              )}
            </div>

            {/* Telegram Card */}
            <div className="bg-card border border-border/60 rounded-3xl p-5 shadow-sm flex flex-col justify-between h-48 hover:border-primary/30 transition-all text-left">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="h-9 w-9 bg-sky-500/10 text-sky-500 rounded-xl flex items-center justify-center font-bold">
                    TG
                  </div>
                  {telegramUrl ? (
                    <span className="text-[9px] font-black tracking-widest uppercase text-sky-500 bg-sky-500/10 px-2 py-0.5 rounded-full">
                      Active Support
                    </span>
                  ) : (
                    <span className="text-[9px] font-black tracking-widest uppercase text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                      Coming Soon
                    </span>
                  )}
                </div>
                <h3 className="font-extrabold text-base text-foreground">Telegram Channel Support</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Connect with our host bots on Telegram to verify transactions, read rules updates, or claim credits.
                </p>
              </div>

              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : telegramUrl ? (
                <a 
                  href={telegramUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full h-11 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-sky-600/10 transition-colors"
                >
                  <span>Launch Telegram channel</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              ) : (
                <Button disabled variant="secondary" className="w-full rounded-xl font-bold text-xs h-11">
                  Offline / Under Maintenance
                </Button>
              )}
            </div>
          </div>

          {/* Quick FAQ / Guidelines */}
          <div className="bg-card border border-border/60 rounded-3xl p-5 shadow-sm space-y-4 text-left">
            <h3 className="font-extrabold text-sm text-foreground flex items-center gap-2">
              <Sparkles className="h-4.5 w-4.5 text-primary" /> Common Support Requests
            </h3>
            
            <div className="space-y-3.5 divide-y divide-border/40 text-xs">
              <div className="space-y-1">
                <p className="font-bold text-foreground">How long does crypto deposit confirmation take?</p>
                <p className="text-muted-foreground leading-relaxed">Crypto deposits are validated on the blockchain and updated automatically. Most confirmations are finished in under 2 minutes.</p>
              </div>
              <div className="space-y-1 pt-3.5">
                <p className="font-bold text-foreground">How do I claim referred player bonuses?</p>
                <p className="text-muted-foreground leading-relaxed">Referral bonuses are reviewed by admins and distributed manually by sending direct vouchers in the support messenger channel chat.</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </AppShell>
  );
}
