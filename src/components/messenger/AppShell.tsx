import { Link, useNavigate, useRouterState, useRouter } from "@tanstack/react-router";
import { MessageCircle, Users, User as UserIcon, LogOut, Shield, Menu, X, Wifi, WifiOff } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { setVerifiedStatus } from "@/lib/auth-wait";
import { useRole } from "@/hooks/useRole";
import { usePresence } from "@/hooks/usePresence";
import { useChatNotifications } from "@/hooks/useChatNotifications";
import { useNativePush } from "@/hooks/useNativePush";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { SignOutDialog } from "@/components/messenger/SignOutDialog";
import { Capacitor } from "@capacitor/core";

const DrawerCtx = createContext<{ open: () => void }>({ open: () => {} });
export const useAppDrawer = () => useContext(DrawerCtx);

function OnlineStatusBanner() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [showConnected, setShowConnected] = useState(false);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      setShowConnected(true);
      const timer = setTimeout(() => {
        setShowConnected(false);
      }, 2500);
      return () => clearTimeout(timer);
    }
    function handleOffline() {
      setIsOnline(false);
      setShowConnected(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!isOnline) {
    return (
      <div className="bg-amber-600 dark:bg-amber-700 text-white text-xs font-semibold py-1.5 px-4 flex items-center justify-center gap-1.5 animate-in slide-in-from-top duration-200 shadow-sm shrink-0">
        <WifiOff className="h-3.5 w-3.5" />
        <span>No internet connection</span>
      </div>
    );
  }

  if (showConnected) {
    return (
      <div className="bg-emerald-600 dark:bg-emerald-700 text-white text-xs font-semibold py-1.5 px-4 flex items-center justify-center gap-1.5 animate-in slide-in-from-top exit-to-top duration-300 shadow-sm shrink-0">
        <Wifi className="h-3.5 w-3.5" />
        <span>Connection restored</span>
      </div>
    );
  }

  return null;
}

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isAdmin } = useRole();
  const [open, setOpen] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  usePresence();
  useChatNotifications();
  useNativePush();


  async function signOut() {
    console.log("[SignOut] Initiated.");
    if (typeof window !== "undefined") {
      console.log("[SignOut] Clearing local storage keys and cookies.");
      localStorage.removeItem("profile_complete");
      localStorage.removeItem("jj_temp_auth_verification");
      setVerifiedStatus(false);
    }
    
    // Get session to check if Google login before signing out
    const sessionRes = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    const session = sessionRes?.data?.session;
    const isGoogleLogin = session?.user?.app_metadata?.provider === "google";

    // Update database presence in the background so it never hangs sign out
    if (session?.user?.id) {
      supabase
        .from("profiles")
        .update({ online: false, last_seen: new Date().toISOString() })
        .eq("id", session.user.id)
        .then(() => console.log("[SignOut] User presence set to offline."))
        .catch((e) => console.error("Failed to update presence:", e));
    }

    await qc.cancelQueries();
    qc.clear();

    if (Capacitor.isNativePlatform() && isGoogleLogin) {
      try {
        const { GoogleAuth } = await import("@codetrix-studio/capacitor-google-auth");
        await GoogleAuth.signOut();
      } catch (e) {
        console.error("Google native sign out failed:", e);
      }
    }

    try {
      console.log("[SignOut] Calling Supabase auth.signOut().");
      await supabase.auth.signOut();
      console.log("[SignOut] Supabase auth.signOut() completed.");
    } catch (e) {
      console.error("Supabase signOut failed:", e);
    }

    await new Promise((resolve) => setTimeout(resolve, 150));

    const hostname = typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";
    const isProdDomain = hostname.endsWith("playjackpotjungle.com");
    console.log("[SignOut] Hostname:", hostname, "isProdDomain:", isProdDomain);
    if (Capacitor.isNativePlatform()) {
      console.log("[SignOut] Native platform - hard redirect on same origin.");
      window.location.href = window.location.origin + "/app/auth";
      return;
    }

    if (isProdDomain) {
      console.log("[SignOut] Redirecting window location to chat domain auth.");
      window.location.href = "https://chat.playjackpotjungle.com/app/auth?logout=true";
    } else {
      console.log("[SignOut] Navigating local router to auth.");
      navigate({ to: "/app/auth", search: { logout: "true" }, replace: true });
    }
  }

  const navItems: Array<{ to: string; icon: typeof MessageCircle; label: string }> = [
    { to: "/app/chat", icon: MessageCircle, label: "Chats" },
    { to: "/app/friends", icon: Users, label: "Friends" },
    { to: "/app/profile", icon: UserIcon, label: "Profile" },
  ];
  if (isAdmin) navItems.push({ to: "/app/admin", icon: Shield, label: "Admin" });

  const Drawer = (
    <aside className="w-72 h-full bg-card border-r border-border flex flex-col">
      <div className="px-4 py-5 flex items-center gap-3 border-b border-border">
        <img src="/icons/icon-192.webp" alt="Logo" className="h-10 w-10 rounded-xl mb-0 shadow-sm object-cover" />
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
          onClick={() => setConfirmOut(true)}
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

        <main className="flex-1 min-w-0 min-h-0 flex flex-col safe-pt safe-pb safe-pl safe-pr">
          <OnlineStatusBanner />
          {children}
        </main>

        <SignOutDialog isOpen={confirmOut} onClose={() => setConfirmOut(false)} onConfirm={signOut} />
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
