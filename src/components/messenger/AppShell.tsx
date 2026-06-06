import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { MessageCircle, Users, User as UserIcon, LogOut, Shield, Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useRole } from "@/hooks/useRole";
import { usePresence } from "@/hooks/usePresence";
import { createContext, useContext, useState, type ReactNode } from "react";

const DrawerCtx = createContext<{ open: () => void }>({ open: () => {} });
export const useAppDrawer = () => useContext(DrawerCtx);

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isAdmin } = useRole();
  const [open, setOpen] = useState(false);
  usePresence();

  async function signOut() {
    await supabase
      .from("profiles")
      .update({ online: false, last_seen: new Date().toISOString() })
      .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "");
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

  const Drawer = (
    <aside className="w-72 h-full bg-card border-r border-border flex flex-col">
      <div className="px-4 py-5 flex items-center gap-3 border-b border-border">
        <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
          <MessageCircle className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="flex-1">
          <p className="font-bold">Jackpot Jungle</p>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Messenger</p>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="md:hidden h-9 w-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-1">
        {navItems.map((n) => {
          const active = pathname.startsWith(n.to);
          return (
            <Link
              key={n.to}
              to={n.to}
              onClick={() => setOpen(false)}
              className={`w-full h-11 rounded-lg flex items-center gap-3 px-3 text-sm font-medium transition-colors ${
                active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <n.icon className="h-5 w-5 shrink-0" />
              <span>{n.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="px-3 py-3 border-t border-border flex items-center gap-2">
        <ThemeToggle />
        <button
          onClick={signOut}
          className="flex-1 h-11 rounded-lg flex items-center gap-3 px-3 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );

  return (
    <DrawerCtx.Provider value={{ open: () => setOpen(true) }}>
      <div className="flex h-[100dvh] bg-background">
        {/* Desktop persistent sidebar */}
        <div className="hidden md:flex">{Drawer}</div>

        {/* Mobile drawer */}
        {open && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
            <div className="relative z-10">{Drawer}</div>
          </div>
        )}

        <main className="flex-1 min-w-0 min-h-0 flex flex-col">{children}</main>
      </div>
    </DrawerCtx.Provider>
  );
}

export function HamburgerButton() {
  const { open } = useAppDrawer();
  return (
    <button
      onClick={open}
      className="md:hidden h-9 w-9 rounded-lg flex items-center justify-center hover:bg-secondary -ml-1"
      aria-label="Open menu"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}
