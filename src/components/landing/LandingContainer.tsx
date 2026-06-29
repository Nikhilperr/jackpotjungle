import React from "react";

export function LandingContainer() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      {/* Header / Navigation placeholder for future landing content */}
      <header className="w-full border-b border-border/40 bg-card/50 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/favicon.ico" alt="Jackpot Jungle Logo" className="h-8 w-8 rounded-full" />
          <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-primary via-purple-400 to-amber-400 bg-clip-text text-transparent">
            Jackpot Jungle
          </span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="/auth"
            className="px-4 py-2 text-sm font-semibold rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-md"
          >
            Launch App
          </a>
        </div>
      </header>

      {/* Main content foundation */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 py-16">
        <div className="max-w-3xl space-y-6 animate-in fade-in zoom-in-95 duration-500">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary">
            ✨ Welcome to Jackpot Jungle
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-tight">
            The Ultimate Social Messenger & Gaming Experience
          </h1>
          <p className="text-muted-foreground text-lg sm:text-xl max-w-2xl mx-auto">
            Connect with friends, chat in real-time, share moments, and play exciting games all in one place.
          </p>
          <div className="pt-4 flex items-center justify-center gap-4">
            <a
              href="/auth"
              className="px-6 py-3 font-bold rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-lg hover:shadow-primary/25 hover:-translate-y-0.5"
            >
              Get Started Now
            </a>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} Jackpot Jungle. All rights reserved.
      </footer>
    </div>
  );
}
