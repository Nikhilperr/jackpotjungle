import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/landing/PublicLayout";
import { HelpCircle, ChevronDown, ArrowRight } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ & Help Center — Jackpot Jungle Casino" },
      { name: "description", content: "Frequently asked questions about Jackpot Jungle accounts, logins, wallet credits, daily rewards, VIP Club levels, referral structures, and messaging features." },
      { property: "og:title", content: "FAQ & Help Center — Jackpot Jungle Casino" },
      { property: "og:description", content: "Find instant answers to common questions about Jackpot Jungle. Wallet setup, rewards, VIP cashback, and notifications guidelines." },
      { property: "og:url", content: "https://playjackpotjungle.com/faq" },
      { name: "twitter:title", content: "FAQ & Help Center — Jackpot Jungle Casino" },
      { name: "twitter:description", content: "Access the Jackpot Jungle self-service FAQ database. Detailed help docs for accounts, gaming, and privacy." },
    ],
  }),
  component: FAQPage,
});

type Category = "account" | "wallet" | "vip" | "chat" | "security";

interface FAQItemData {
  q: string;
  a: string;
  cat: Category;
}

function FAQPage() {
  const [activeCategory, setActiveCategory] = useState<Category>("account");

  const categories: Array<{ id: Category; label: string }> = [
    { id: "account", label: "Account & Login" },
    { id: "wallet", label: "Wallet & Credits" },
    { id: "vip", label: "VIP & Rewards" },
    { id: "chat", label: "Chat & Notifications" },
    { id: "security", label: "Security & Safety" },
  ];

  const faqs: FAQItemData[] = [
    // Account
    {
      cat: "account",
      q: "What is Jackpot Jungle?",
      a: "Jackpot Jungle is a social gaming and messenger platform where players can chat, call friends, make sweeps slot spins, level up on leaderboards, and claim daily free coins securely.",
    },
    {
      cat: "account",
      q: "How do I sign up and complete onboarding?",
      a: "Creating an account is free. Enter an email and choose a password, verify your email with the OTP code, then input a username and name to complete the initial profile onboarding steps.",
    },
    // Wallet
    {
      cat: "wallet",
      q: "How do I claim my signup welcome credits?",
      a: "Once you complete your onboarding profile verification, our backend automatically credits your wallet balance with a $5.00 welcome bonus.",
    },
    {
      cat: "wallet",
      q: "How do I check my transaction history log?",
      a: "Open your wallet tab inside the Jackpot Jungle application dashboard to view all historical reward spins, referral payout logs, and user credit transfers.",
    },
    // VIP
    {
      cat: "vip",
      q: "How do the VIP tier levels work?",
      a: "Our VIP program has 5 levels (Bronze, Silver, Gold, Platinum, Diamond) based on wallet holdings. Leveling up unlocks greater daily cashback rates (up to 8%), weekly multipliers, and dedicated host support.",
    },
    {
      cat: "vip",
      q: "How does the Referral partner program work?",
      a: "Share your referral code with friends. Once they verify their onboarding profile, both of you receive instant bonus credits, and you accumulate 10% lifetime commissions on their reward activities.",
    },
    // Chat
    {
      cat: "chat",
      q: "Can I make voice and video calls inside the app?",
      a: "Yes. Our messenger integrates real-time signaling websockets. Simply click the telephone or video icon inside any player chat screen to start call sessions.",
    },
    {
      cat: "chat",
      q: "Why am I not receiving chat push notifications?",
      a: "Check that notification permissions are allowed on your mobile device. If using our native Android APK, verify that background battery activity is not restricted.",
    },
    // Security
    {
      cat: "security",
      q: "How is my account profile kept secure?",
      a: "All database tables are governed by Row Level Security (RLS). Private messaging logs are protected with secure encryption, and signin requests utilize Google OAuth or secure email OTP checks.",
    },
    {
      cat: "security",
      q: "Are the social slots spins checked for fairness?",
      a: "Yes. Spin payouts utilize server-side cryptographically secure pseudorandom generators, ensuring completely unbiased rewards.",
    },
  ];

  const filteredFaqs = faqs.filter((f) => f.cat === activeCategory);

  return (
    <PublicLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex h-14 w-14 rounded-full bg-primary/10 text-primary items-center justify-center border border-primary/20 shadow-md">
            <HelpCircle className="h-7 w-7" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground">
            Frequently Asked Questions
          </h1>
          <p className="text-muted-foreground text-lg">
            Got questions? We've got answers. Browse our most common queries regarding accounts, credits, and support.
          </p>
        </div>

        {/* Categories Tab Bar */}
        <div className="flex flex-wrap justify-center gap-2 border-b border-border/40 pb-6">
          {categories.map((c) => {
            const active = activeCategory === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setActiveCategory(c.id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  active 
                    ? "bg-secondary text-primary border-primary border" 
                    : "text-muted-foreground hover:bg-secondary/40"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {/* FAQs */}
        <div className="space-y-4 min-h-[300px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeCategory}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {filteredFaqs.map((faq, idx) => (
                <FAQItem key={idx} question={faq.q} answer={faq.a} />
              ))}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Still Have Questions Banner */}
        <div className="bg-secondary/20 border border-border/40 rounded-3xl p-8 text-center space-y-4">
          <h3 className="text-xl font-bold text-foreground">Still Have Questions?</h3>
          <p className="text-sm text-muted-foreground">Our 24/7 customer support team is always online to help you.</p>
          <div className="pt-2">
            <Link
              to="/support"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-xs bg-primary text-primary-foreground hover:opacity-90 transition-all shadow-md"
            >
              <span>Contact Support</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border/60 bg-card rounded-2xl overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen(!open)}
        className="w-full p-5 text-left font-bold text-sm sm:text-base text-foreground flex items-center justify-between gap-4 hover:bg-secondary/20 transition-colors"
      >
        <span>{question}</span>
        <ChevronDown className={`h-5 w-5 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-5 pb-5 text-xs sm:text-sm text-muted-foreground leading-relaxed animate-in slide-in-from-top-2 duration-150">
          {answer}
        </div>
      )}
    </div>
  );
}
