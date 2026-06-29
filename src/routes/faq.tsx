import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/landing/PublicLayout";
import { HelpCircle, ChevronDown, ArrowRight } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/faq")({
  head: () => ({ meta: [{ title: "FAQ — Jackpot Jungle" }] }),
  component: FAQPage,
});

function FAQPage() {
  const faqs = [
    {
      q: "What is Jackpot Jungle?",
      a: "Jackpot Jungle is a next-generation real-time messenger and social gaming application. Users can invite friends, chat, make voice and video calls, track rankings on a live leaderboard, and earn rewards based on daily interactions.",
    },
    {
      q: "How do I claim my welcome bonus?",
      a: "Simply sign up and complete your onboarding profile (verifying your first name, last name, and email). Once completed, your free $5.00 wallet credit bonus is instantly deposited.",
    },
    {
      q: "How does the Referral Program work?",
      a: "Each user has a unique referral code. When someone signs up using your code, both of you receive a signup credit, and you earn a 10% commission on all of their active rewards activities forever.",
    },
    {
      q: "Is the platform secure?",
      a: "Yes. Jackpot Jungle uses industry-standard database row-level security (RLS) policies, secure email OTP codes, and Google OAuth credentials to ensure your account information and private communications are kept secure.",
    },
    {
      q: "How can I contact customer support?",
      a: "Support is available 24/7. Logged-in users can reach a live admin operator directly via the official support page link inside the application chat screen. Alternatively, you can email support@playjackpotjungle.com.",
    },
  ];

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

        {/* FAQs */}
        <div className="space-y-4">
          {faqs.map((faq, idx) => (
            <FAQItem key={idx} question={faq.q} answer={faq.a} />
          ))}
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
