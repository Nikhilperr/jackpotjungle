import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/landing/PublicLayout";
import { FileText, Calendar, ArrowRight, User } from "lucide-react";

export const Route = createFileRoute("/blog")({
  head: () => ({ meta: [{ title: "Blog & News — Jackpot Jungle" }] }),
  component: BlogPage,
});

function BlogPage() {
  const posts = [
    {
      title: "Introducing Jackpot Jungle VIP Tiers & Lifetime Cashback",
      date: "June 28, 2026",
      author: "Jackpot Team",
      desc: "Discover how our new 5-tier VIP membership delivers automatic daily cashback, custom streaks, and priority support.",
    },
    {
      title: "How Real-Time Messenger Power Elevates Social Gaming",
      date: "June 20, 2026",
      author: "Product Engineering",
      desc: "Learn about our WebSocket architecture, instant message forwarding, and voice call integration.",
    },
    {
      title: "Maximizing Your Referral Earnings: A Complete Guide",
      date: "June 12, 2026",
      author: "Community Host",
      desc: "Tips on sharing your referral link, building your player network, and unlocking active commission multipliers.",
    },
  ];

  return (
    <PublicLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-16">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex h-14 w-14 rounded-full bg-primary/10 text-primary items-center justify-center border border-primary/20 shadow-md">
            <FileText className="h-7 w-7" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground">
            Latest News & Blog Updates
          </h1>
          <p className="text-muted-foreground text-lg">
            Stay up to date with product releases, feature updates, community spotlights, and strategy guides.
          </p>
        </div>

        {/* Blog Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {posts.map((post) => (
            <div 
              key={post.title}
              className="p-6 rounded-2xl bg-card border border-border/60 hover:border-primary/50 transition-all flex flex-col justify-between shadow-md"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {post.date}</span>
                  <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> {post.author}</span>
                </div>
                <h3 className="font-extrabold text-xl text-foreground leading-snug">{post.title}</h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  {post.desc}
                </p>
              </div>
              <div className="pt-6">
                <Link
                  to="/auth"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
                >
                  <span>Read Article</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PublicLayout>
  );
}
