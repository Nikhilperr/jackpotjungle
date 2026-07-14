import { createFileRoute } from "@tanstack/react-router";
import { AppShell, HamburgerButton } from "@/components/messenger/AppShell";
import { HelpCircle, ChevronDown, Sparkles, AlertCircle } from "lucide-react";
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

  const faqs: FAQItem[] = [
    {
      category: "Wallet & Cashin/Cashout",
      q: "How long do crypto deposit (cash-in) confirmations take?",
      a: (
        <div className="space-y-2 text-muted-foreground">
          <p>Blockchain confirmation times depend on current network congestion:</p>
          <div className="grid grid-cols-2 gap-2 text-[11px] bg-background/50 p-2.5 rounded-xl border border-border/40 font-mono">
            <div className="text-foreground">Bitcoin (BTC):</div>
            <div className="text-foreground font-bold text-right">1-2 blocks (~10-15 min)</div>
            <div className="text-foreground">Litecoin (LTC):</div>
            <div className="text-foreground font-bold text-right">1-2 blocks (~2-4 min)</div>
            <div className="text-foreground">USDT / USDC:</div>
            <div className="text-foreground font-bold text-right">Instant to 2 min</div>
          </div>
          <p>Once the transactions are validated, credits are automatically added to your balance.</p>
        </div>
      ),
    },
    {
      category: "Wallet & Cashin/Cashout",
      q: "How do I withdraw (cash-out) my social casino credits?",
      a: (
        <div className="space-y-2 text-muted-foreground">
          <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl text-foreground text-[11px] font-semibold leading-relaxed mb-2">
            ⚠️ IMPORTANT: Withdrawals are NOT automated. You must directly message our support hosts in this chat.
          </div>
          <p>To request a withdrawal:</p>
          <ol className="list-decimal list-inside space-y-1.5 pl-1">
            <li>Send your registered username and requested cash-out amount.</li>
            <li>Provide your receiving cryptocurrency wallet address (or payment identifier).</li>
            <li>Our hosts will audit the ledger logs and process the payout within 10 to 30 minutes.</li>
          </ol>
        </div>
      ),
    },
    {
      category: "VIP & Loyalty perks",
      q: "How does the VIP Club progression milestone work?",
      a: (
        <div className="space-y-2.5 text-muted-foreground">
          <p>Your total lifetime cash-ins translate directly to VIP Experience Points (XP). Level targets:</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 bg-background/50 p-3 rounded-xl border border-border/40 font-mono text-[11px]">
            <div className="text-foreground">Bronze:</div>
            <div className="text-right">$100.00 Target</div>
            <div className="text-foreground">Silver:</div>
            <div className="text-right">$250.00 Target</div>
            <div className="text-foreground">Gold:</div>
            <div className="text-right">$500.00 Target</div>
            <div className="text-foreground">Platinum:</div>
            <div className="text-right">$1,000.00 Target</div>
            <div className="text-foreground">Diamond:</div>
            <div className="text-right">$5,000.00 Target</div>
            <div className="text-primary font-bold">Black Diamond:</div>
            <div className="text-primary text-right font-bold">$10,000.00 Target</div>
          </div>
          <p>Contact a support host upon hitting a milestone tier to claim your bonus payout.</p>
        </div>
      ),
    },
    {
      category: "Messenger & Referrals",
      q: "How do I claim referred friend bonuses?",
      a: (
        <div className="space-y-2 text-muted-foreground">
          <p>Referral credits are manually audited to prevent abuse:</p>
          <ol className="list-disc list-inside space-y-1.5 pl-1">
            <li>Direct message a support host with your friend's platform username.</li>
            <li>Once the host verifies their active play history and initial deposits, they will issue your cash bonus credits.</li>
            <li>Voucher codes are delivered directly in your support messenger thread.</li>
          </ol>
        </div>
      ),
    },
  ];

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        {/* Page Header */}
        <div className="p-3 border-b border-border flex items-center gap-2">
          <HamburgerButton />
          <h1 className="font-bold flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            <span>Help & FAQ</span>
          </h1>
        </div>

        {/* Page Body */}
        <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6 animate-in fade-in duration-300">
          {/* Header Banner */}
          <div className="rounded-3xl bg-gradient-to-br from-primary/20 via-purple-600/10 to-amber-500/10 border border-border/80 p-6 flex items-center justify-between gap-6 select-none">
            <div className="space-y-2 text-left">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-primary/20 text-primary border border-primary/30 tracking-widest inline-block flex items-center gap-1 w-fit">
                <Sparkles className="h-3 w-3" />
                Frequently Asked Questions
              </span>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
                Got Questions? We Have Answers.
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Find quick answers below regarding deposits, cashback, referrals, and VIP club rules. If your issue persists, connect with our Support Hosts.
              </p>
            </div>
          </div>

          {/* Accordion List */}
          <div className="space-y-3">
            {faqs.map((faq, idx) => {
              const isOpen = openIdx === idx;
              return (
                <div 
                  key={idx}
                  className="rounded-2xl border border-border bg-card overflow-hidden transition-all duration-200"
                >
                  <button
                    onClick={() => setOpenIdx(isOpen ? null : idx)}
                    className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left font-bold text-sm text-foreground hover:bg-secondary/40 transition-colors focus:outline-none"
                  >
                    <div className="space-y-1">
                      <span className="text-[9px] uppercase font-black tracking-wider text-primary block">
                        {faq.category}
                      </span>
                      <span>{faq.q}</span>
                    </div>
                    <ChevronDown className={`h-4.5 w-4.5 text-muted-foreground shrink-0 transition-transform duration-300 ${isOpen ? "rotate-180 text-primary" : ""}`} />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 pt-3 text-xs text-muted-foreground leading-relaxed border-t border-border/40 text-left bg-secondary/10 animate-in slide-in-from-top-2 duration-200">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Alert Call */}
          <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4 flex items-start gap-3 text-left">
            <AlertCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="font-bold text-xs text-foreground">Need direct help?</h4>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                If you have a customized ledger or credit issue that needs host review, visit the **Support** page to launch WhatsApp or Telegram host group servers.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
