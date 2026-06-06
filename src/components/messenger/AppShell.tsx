import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { MessageCircle, Users, User as UserIcon, LogOut, Shield } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useRole } from "@/hooks/useRole";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isAdmin } = useRole();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const navItems: Array<{ to: string; icon: typeof MessageCircle; label: string }> = [
    { to: "/chat", icon: MessageCircle, label: "Chats" },
    { to: "/friends", icon: Users, label: "Friends" },
    { to: "/profile", icon: UserIcon, label: "Profile" },
  ];
  if (isAdmin) navItems.push({ to: "/admin", icon: Shield, label: "Admin" });

  return (
    <div className="flex h-screen bg-background">
      <aside className="w-16 md:w-20 border-r border-border flex flex-col items-center py-4 gap-2 bg-card">
        <Link to="/chat" className="h-10 w-10 rounded-full bg-primary flex items-center justify-center mb-4">
          <MessageCircle className="h-5 w-5 text-primary-foreground" />
        </Link>
        {navItems.map((n) => {
          const active = pathname.startsWith(n.to);
          return (
            <Link
              key={n.to}
              to={n.to}
              className={`h-12 w-12 rounded-2xl flex items-center justify-center transition-colors ${
                active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"
              }`}
              title={n.label}
            >
              <n.icon className="h-5 w-5" />
            </Link>
          );
        })}
        <div className="mt-auto flex flex-col items-center gap-2">
          <ThemeToggle />
          <button
            onClick={signOut}
            className="h-12 w-12 rounded-2xl flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-destructive"
            title="Sign out"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
