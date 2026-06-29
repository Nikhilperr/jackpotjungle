import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/landing/PublicLayout";
import { FileText, Calendar, ArrowRight, User, Search, BookOpen } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/blog")({
  head: () => ({
    meta: [
      { title: "Jackpot Jungle Blog — Casino News & Guides" },
      { name: "description", content: "Stay updated with the latest news, guides, and feature announcements from Jackpot Jungle. Read VIP strategies and product updates." },
      { property: "og:title", content: "Jackpot Jungle Blog — Casino News & Guides" },
      { property: "og:description", content: "Read news, VIP guides, and platform updates from the Jackpot Jungle social casino messenger team." },
      { property: "og:url", content: "https://playjackpotjungle.com/blog" },
      { name: "twitter:title", content: "Jackpot Jungle Blog — Casino News & Guides" },
      { name: "twitter:description", content: "Access product updates, community newsletters, and rewards guides at Jackpot Jungle." },
    ],
  }),
  component: BlogPage,
});

type Category = "all" | "announcements" | "guides" | "technology";

interface BlogPost {
  title: string;
  date: string;
  author: string;
  desc: string;
  time: string;
  cat: Category;
  featured?: boolean;
}

function BlogPage() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<Category>("all");

  const categories: Array<{ id: Category; label: string }> = [
    { id: "all", label: "All Articles" },
    { id: "announcements", label: "Announcements" },
    { id: "guides", label: "Player Guides" },
    { id: "technology", label: "Technology" },
  ];

  const posts: BlogPost[] = [
    {
      title: "Introducing Jackpot Jungle VIP Tiers & Lifetime Cashback",
      date: "June 28, 2026",
      author: "Jackpot Team",
      desc: "Discover how our new 5-tier VIP membership delivers automatic daily cashback, custom streaks, and priority support.",
      time: "5 min read",
      cat: "announcements",
      featured: true,
    },
    {
      title: "How Real-Time Messenger Power Elevates Social Gaming",
      date: "June 20, 2026",
      author: "Product Engineering",
      desc: "Learn about our WebSocket architecture, instant message forwarding, and voice call integration.",
      time: "8 min read",
      cat: "technology",
    },
    {
      title: "Maximizing Your Referral Earnings: A Complete Guide",
      date: "June 12, 2026",
      author: "Community Host",
      desc: "Tips on sharing your referral link, building your player network, and unlocking active commission multipliers.",
      time: "4 min read",
      cat: "guides",
    },
    {
      title: "Google OAuth & Row Level Security: Keeping Casino Play Safe",
      date: "June 05, 2026",
      author: "Security Team",
      desc: "An in-depth writeup detailing database encryption, session token policies, and email OTP verification procedures.",
      time: "6 min read",
      cat: "technology",
    },
  ];

  const filteredPosts = posts.filter((p) => {
    if (activeCategory !== "all" && p.cat !== activeCategory) return false;
    if (search.trim() && !p.title.toLowerCase().includes(search.toLowerCase()) && !p.desc.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const featuredPost = posts.find((p) => p.featured);
  const standardPosts = filteredPosts.filter((p) => !p.featured || activeCategory !== "all" || search.trim());

  return (
    <PublicLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-12">
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

        {/* Search & Categories */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-5xl mx-auto border-b border-border/40 pb-6">
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => {
              const active = activeCategory === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveCategory(c.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    active 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          <div className="relative w-full md:w-72">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="Search articles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-card border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/20 text-foreground"
            />
          </div>
        </div>

        {/* Featured Post Card */}
        {featuredPost && activeCategory === "all" && !search.trim() && (
          <div className="max-w-5xl mx-auto rounded-3xl overflow-hidden bg-card border border-border flex flex-col md:flex-row hover:border-primary/45 transition-all shadow-xl group">
            <div className="p-8 md:p-12 flex-1 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 font-bold uppercase tracking-wider text-[10px]">Featured Article</span>
                  <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {featuredPost.date}</span>
                  <span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" /> {featuredPost.time}</span>
                </div>
                <h2 className="text-2xl sm:text-4xl font-extrabold text-foreground leading-tight group-hover:text-primary transition-colors">
                  {featuredPost.title}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {featuredPost.desc}
                </p>
              </div>
              <div className="pt-4 flex items-center justify-between border-t border-border/40">
                <span className="text-xs text-muted-foreground">Written by <strong>{featuredPost.author}</strong></span>
                <Link
                  to="/app/auth"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs bg-primary text-primary-foreground hover:opacity-90 transition-all shadow-md"
                >
                  <span>Read Article</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Blog Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {standardPosts.map((post) => (
            <div 
              key={post.title}
              className="p-6 rounded-2xl bg-card border border-border/60 hover:border-primary/50 transition-all flex flex-col justify-between shadow-md"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {post.date}</span>
                  <span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" /> {post.time}</span>
                </div>
                <h3 className="font-extrabold text-lg text-foreground leading-snug">{post.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {post.desc}
                </p>
              </div>
              <div className="pt-6 flex items-center justify-between border-t border-border/40 mt-4">
                <span className="text-[10px] text-muted-foreground">By <strong>{post.author}</strong></span>
                <Link
                  to="/app/auth"
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
