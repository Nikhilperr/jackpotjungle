import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/landing/PublicLayout";
import { MessageSquare, Mail, ShieldAlert, ArrowRight, HelpCircle } from "lucide-react";

export const Route = createFileRoute("/support")({
  head: () => ({ meta: [{ title: "Customer Support — Jackpot Jungle" }] }),
  component: SupportPage,
});

function SupportPage() {
  return (
    <PublicLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-16">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex h-14 w-14 rounded-full bg-primary/10 text-primary items-center justify-center border border-primary/20 shadow-md">
            <MessageSquare className="h-7 w-7" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground">
            Customer Support Center
          </h1>
          <p className="text-muted-foreground text-lg">
            Need help? Our dedicated support team is available 24/7. Get in touch with us directly or view our guides.
          </p>
        </div>

        {/* Contact Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {/* Choice 1 */}
          <div className="p-8 rounded-3xl bg-card border border-border/60 text-center space-y-4 shadow-md flex flex-col justify-between">
            <div className="space-y-4">
              <div className="h-12 w-12 mx-auto rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <MessageSquare className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-xl text-foreground">In-App Live Chat</h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Connect directly with support operators in real-time. Simply open the Jackpot Jungle support page channel.
              </p>
            </div>
            <div className="pt-6">
              <Link
                to="/auth"
                className="w-full py-3 rounded-xl font-bold text-xs bg-primary text-primary-foreground hover:opacity-90 transition-all flex items-center justify-center gap-1.5 shadow-md shadow-primary/10"
              >
                <span>Launch Live Chat</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {/* Choice 2 */}
          <div className="p-8 rounded-3xl bg-card border border-border/60 text-center space-y-4 shadow-md flex flex-col justify-between">
            <div className="space-y-4">
              <div className="h-12 w-12 mx-auto rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <Mail className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-xl text-foreground">Email Ticket Support</h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Send us a ticket detailing your query. Our admin team replies to all email support requests within 24 hours.
              </p>
            </div>
            <div className="pt-6">
              <a
                href="mailto:support@playjackpotjungle.com"
                className="w-full py-3 rounded-xl font-bold text-xs bg-secondary text-foreground hover:bg-accent border border-border/60 transition-colors flex items-center justify-center gap-1.5"
              >
                <span>Email Support</span>
              </a>
            </div>
          </div>

          {/* Choice 3 */}
          <div className="p-8 rounded-3xl bg-card border border-border/60 text-center space-y-4 shadow-md flex flex-col justify-between">
            <div className="space-y-4">
              <div className="h-12 w-12 mx-auto rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                <HelpCircle className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-xl text-foreground">FAQ Documentation</h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Browse our comprehensive guide detailing rewards rules, account safety, referrals, and wallets.
              </p>
            </div>
            <div className="pt-6">
              <Link
                to="/faq"
                className="w-full py-3 rounded-xl font-bold text-xs bg-secondary text-foreground hover:bg-accent border border-border/60 transition-colors flex items-center justify-center gap-1.5"
              >
                <span>View FAQs</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
