import { createFileRoute } from "@tanstack/react-router";
import { AppShell, HamburgerButton } from "@/components/messenger/AppShell";
import { HelpCircle, ChevronDown, Sparkles, AlertCircle, Search, HelpCircle as QuestionIcon } from "lucide-react";
import React, { useState } from "react";

export const Route = createFileRoute("/app/_authenticated/help")({
  ssr: false,
  head: () => ({ meta: [{ title: "Help & FAQ — JJ Messenger" }] }),
  component: HelpFAQPage,
});

type FAQItem = {
  q: string;
  a: React.ReactNode;
  category: string;
};

function HelpFAQPage() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const [searchQuery, setSearchQuery] = useState("");

  const faqs: FAQItem[] = [
    {
      category: "Wallet & Cashin/Cashout",
      q: "How long do crypto deposit (cash-in) confirmations take?",
      a: (
        <div className="space-y-3 text-muted-foreground font-sans">
          <p className="text-xs leading-relaxed">
            Blockchain confirmation times vary based on network load and your chosen currency. Once detected on the network, the credits will automatically appear in your wallet.
          </p>
          <div className="rounded-2xl border border-border/60 bg-secondary/20 p-3.5 space-y-2">
            <h4 className="text-[10px] font-black uppercase text-foreground/80 tracking-wider">Average Network Times</h4>
            <div className="grid grid-cols-2 gap-y-2 text-xs font-mono">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                <span>Bitcoin (BTC)</span>
              </div>
              <div className="text-foreground font-bold text-right">1-2 blocks (~10-15m)</div>

              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                <span>Litecoin (LTC)</span>
              </div>
              <div className="text-foreground font-bold text-right">1-2 blocks (~2-4m)</div>

              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span>USDT / USDC</span>
              </div>
              <div className="text-foreground font-bold text-right">1 block (~1-2m)</div>
            </div>
          </div>
        </div>
      ),
    },
    {
      category: "Wallet & Cashin/Cashout",
      q: "How do I withdraw (cash-out) my social casino credits?",
      a: (
        <div className="space-y-3 text-muted-foreground font-sans">
          <div className="p-3.5 bg-primary/10 border border-primary/20 rounded-2xl text-foreground text-xs font-bold leading-relaxed flex items-start gap-2.5">
            <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
            <p>Withdrawals are NOT handled via automated buttons. You must directly message our support hosts in this chat.</p>
          </div>
          <p className="text-xs">Follow these steps to submit your request:</p>
          <div className="space-y-2 text-xs">
            <div className="flex items-start gap-2.5">
              <span className="h-5 w-5 rounded-full bg-secondary text-foreground font-black text-[10px] flex items-center justify-center shrink-0">1</span>
              <p className="pt-0.5">Send your registered username and requested cash-out amount.</p>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="h-5 w-5 rounded-full bg-secondary text-foreground font-black text-[10px] flex items-center justify-center shrink-0">2</span>
              <p className="pt-0.5">Provide your receiving cryptocurrency wallet address (or payment identifier).</p>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="h-5 w-5 rounded-full bg-secondary text-foreground font-black text-[10px] flex items-center justify-center shrink-0">3</span>
              <p className="pt-0.5">Our support hosts will audit the ledger records and process the payout within 10 to 30 minutes.</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      category: "VIP & Loyalty perks",
      q: "How does the VIP Club progression milestone work?",
      a: (
        <div className="space-y-3 text-muted-foreground font-sans">
          <p className="text-xs leading-relaxed">
            Every dollar you deposit increases your VIP Experience Points (XP). Level targets are structured progressively:
          </p>
          <div className="rounded-2xl border border-border/60 bg-secondary/20 p-3.5 space-y-2">
            <h4 className="text-[10px] font-black uppercase text-foreground/80 tracking-wider">Milestone Tiers</h4>
            <div className="grid grid-cols-2 gap-y-1.5 text-xs font-mono">
              <div>Bronze:</div>
              <div className="text-foreground font-bold text-right">$100.00 Target</div>
              <div>Silver:</div>
              <div className="text-foreground font-bold text-right">$250.00 Target</div>
              <div>Gold:</div>
              <div className="text-foreground font-bold text-right">$500.00 Target</div>
              <div>Platinum:</div>
              <div className="text-foreground font-bold text-right">$1,000.00 Target</div>
              <div>Diamond:</div>
              <div className="text-foreground font-bold text-right">$5,000.00 Target</div>
              <div className="text-primary font-bold">Black Diamond:</div>
              <div className="text-primary font-bold text-right">$10,000.00 Target</div>
            </div>
          </div>
          <p className="text-xs">Contact a support host upon hitting a milestone tier to claim your bonus payout.</p>
        </div>
      ),
    },
    {
      category: "Messenger & Referrals",
      q: "How do I claim referred friend bonuses?",
      a: (
        <div className="space-y-3 text-muted-foreground font-sans">
          <p className="text-xs leading-relaxed">
            Referral credits are manually audited to ensure compliance and prevent bot activity:
          </p>
          <div className="space-y-2.5 text-xs">
            <div className="flex items-start gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-2" />
              <p>Direct message a support host with your friend's platform username.</p>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-2" />
              <p>Once the host verifies their active play history and initial deposits, they will issue your cash bonus credits.</p>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-2" />
              <p>Voucher codes are delivered directly in your support messenger thread.</p>
            </div>
          </div>
        </div>
      ),
    },
  ];

  const filteredFaqs = faqs.filter(
    (faq) =>
      faq.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <AppShell>
      <div className="h-full overflow-y-auto bg-background/30">
        {/* Page Header */}
        <div className="p-3 border-b border-border flex items-center gap-2 bg-card/60 backdrop-blur-md sticky top-0 z-10">
          <HamburgerButton />
          <h1 className="font-extrabold flex items-center gap-2 text-foreground font-sans">
            <HelpCircle className="h-5 w-5 text-primary" />
            <span>Help & FAQ</span>
          </h1>
        </div>

        {/* Page Body */}
        <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6 animate-in fade-in duration-300">
          {/* Header Banner */}
          <div className="rounded-3xl bg-gradient-to-br from-primary/15 via-purple-600/5 to-amber-500/5 border border-border/60 p-6 sm:p-8 relative overflow-hidden shadow-sm select-none text-left">
            <div className="space-y-3 max-w-xl">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-primary/20 text-primary border border-primary/30 tracking-widest inline-block flex items-center gap-1 w-fit">
                <Sparkles className="h-3 w-3 animate-pulse" />
                Support Center
              </span>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-foreground font-sans">
                Got Questions? We Have Answers.
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Find quick answers below regarding deposits, withdrawals, referrals, and VIP club progression. If your issue persists, connect with our Support Hosts.
              </p>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-4 top-3.5 h-4.5 w-4.5 text-muted-foreground/60" />
            <input
              type="text"
              placeholder="Search help topics or keywords..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-2xl bg-card border border-border/80 focus:border-primary/50 focus:ring-1 focus:ring-primary/35 placeholder:text-muted-foreground/50 text-sm font-sans focus:outline-none transition-all"
            />
          </div>

          {/* Accordion List */}
          <div className="space-y-3">
            {filteredFaqs.length > 0 ? (
              filteredFaqs.map((faq, idx) => {
                const isOpen = openIdx === idx;
                return (
                  <div 
                    key={idx}
                    className="rounded-2xl border border-border bg-card/60 hover:border-border transition-all duration-300 shadow-sm"
                  >
                    <button
                      onClick={() => setOpenIdx(isOpen ? null : idx)}
                      className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left font-bold text-sm text-foreground hover:bg-secondary/25 transition-colors focus:outline-none"
                    >
                      <div className="space-y-1">
                        <span className="text-[9px] uppercase font-black tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/10 w-fit block font-sans">
                          {faq.category}
                        </span>
                        <span className="font-sans leading-relaxed block pt-1">{faq.q}</span>
                      </div>
                      <ChevronDown className={`h-4.5 w-4.5 text-muted-foreground shrink-0 transition-transform duration-300 ${isOpen ? "rotate-180 text-primary" : ""}`} />
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-5 pt-3.5 text-xs text-muted-foreground leading-relaxed border-t border-border/40 text-left bg-secondary/5 animate-in slide-in-from-top-2 duration-250">
                        {faq.a}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="py-12 text-center space-y-2 border border-dashed border-border rounded-2xl bg-card/45">
                <QuestionIcon className="h-8 w-8 text-muted-foreground/50 mx-auto" />
                <h4 className="font-bold text-sm text-foreground">No matching FAQ topics found</h4>
                <p className="text-xs text-muted-foreground">Try searching for other terms like 'crypto', 'wallet', 'VIP', or 'refer'.</p>
              </div>
            )}
          </div>

          {/* Alert Call */}
          <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4.5 flex items-start gap-3.5 text-left shadow-inner">
            <AlertCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="font-bold text-xs text-foreground font-sans">Need direct help?</h4>
              <p className="text-[11px] text-muted-foreground leading-relaxed font-sans">
                If you have a customized ledger or credit issue that needs host review, visit the **Support** page to launch WhatsApp or Telegram host group servers.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
