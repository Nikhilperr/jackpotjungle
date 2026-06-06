import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { MessageCircle, Users, Zap, Shield } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Jackpot Jungle Messenger — Private real-time chat" },
      { name: "description", content: "A private messenger built for the Jackpot Jungle community. Real-time chat, friends, profiles." },
      { property: "og:title", content: "Jackpot Jungle Messenger" },
      { property: "og:description", content: "Private real-time chat for the Jackpot Jungle community." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/chat" });
  }, [user, loading, navigate]);

  return (
    <main className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center">
            <MessageCircle className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg">Jackpot Jungle</span>
        </div>
        <Link to="/auth" className="text-sm font-semibold text-primary hover:underline">Sign in</Link>
      </header>

      <section className="max-w-6xl mx-auto px-6 pt-16 pb-24 text-center">
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-foreground">
          Chat with your <span className="text-primary">crew</span>.
          <br />Instantly. Privately.
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          Jackpot Jungle Messenger is a real-time chat platform built for our community —
          add friends with a friend code, talk in real time, no third parties.
        </p>
        <div className="mt-10 flex items-center justify-center gap-3">
          <Link to="/auth" className="inline-flex items-center justify-center rounded-full bg-primary px-7 py-3 text-base font-semibold text-primary-foreground hover:opacity-90 transition-opacity">
            Get started
          </Link>
          <Link to="/auth" className="inline-flex items-center justify-center rounded-full bg-secondary px-7 py-3 text-base font-semibold text-secondary-foreground hover:bg-accent transition-colors">
            I have an account
          </Link>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-24 grid md:grid-cols-3 gap-6">
        {[
          { icon: Zap, title: "Real-time", body: "Messages appear instantly. Seen receipts and live updates." },
          { icon: Users, title: "Friend Codes", body: "Every member gets a unique friend code. Add who you want." },
          { icon: Shield, title: "Private", body: "No Facebook. No third parties. Your conversations stay here." },
        ].map((f) => (
          <div key={f.title} className="rounded-2xl bg-secondary p-6">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <f.icon className="h-5 w-5 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground">{f.title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{f.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
