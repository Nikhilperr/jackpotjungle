import { createFileRoute } from "@tanstack/react-router";
import { AppShell, HamburgerButton } from "@/components/messenger/AppShell";
import { HelpCircle, ChevronDown, Sparkles, MessageCircle, AlertCircle } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/app/_authenticated/help")({
  ssr: false,
  head: () => ({ meta: [{ title: "Help & FAQ — JJ Messenger" }] }),
  component: HelpFAQPage,
});

type FAQItem = {
  q: string;
  a: string;
  category: string;
};

function HelpFAQPage() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const faqs: FAQItem[] = [
    {
      category: "Wallet & Cashin/Cashout",
      q: "How long do crypto deposit (cash-in) confirmations take?",
      a: "Crypto deposits are validated on the blockchain and updated automatically. Most confirmations are processed in under 2 minutes. Once the minimum confirmations are reached, your balance will reflect in your wallet instantly.",
    },
    {
      category: "Wallet & Cashin/Cashout",
      q: "How do I withdraw (cash-out) my social casino credits?",
      a: "To request a cash-out, navigate to the Wallet tab, select Withdraw, specify your currency and wallet address, and click submit. Our hosts audit transactions manually within 10-30 minutes for security purposes.",
    },
    {
      category: "VIP & Loyalty perks",
      q: "How does the VIP Club progression milestone work?",
      a: "Every dollar you deposit increases your VIP Experience Points (XP). As your XP reaches milestone thresholds, you progress through VIP levels (Bronze, Silver, Gold, Platinum, Diamond) which yield larger cashback ratios and weekly reward bonuses.",
    },
    {
      category: "Bonuses & Vouchers",
      q: "How do I claim a 7-Day Login Streak or Milestones reward?",
      a: "Go to the Rewards Center, find the active reward (e.g. Daily lucky spin), and click 'Claim Reward'. Our system will run automated checks on your daily logs, after which your host will credit your balance.",
    },
    {
      category: "Messenger & Referrals",
      q: "How do I claim referred friend bonuses?",
      a: "Referral bonuses are not automatic. After linking the referrer relationship in User Settings, the host verifies the criteria based on play history and issues the credits manually via direct Page Message vouchers.",
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
                    <div className="px-5 pb-5 pt-1 text-xs text-muted-foreground leading-relaxed border-t border-border/40 text-left bg-secondary/10 animate-in slide-in-from-top-2 duration-200">
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
