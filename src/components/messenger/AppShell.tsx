import { Link, useNavigate, useRouterState, useRouter, useLocation } from "@tanstack/react-router";
import { MessageCircle, Users, User as UserIcon, LogOut, Shield, Menu, X, Wifi, WifiOff, Wallet, Award, Trophy, Gift, Phone, MoreHorizontal, Coins, Crown, Target, Bell, Settings, HelpCircle, Ban, Share2, Star, Info, ChevronRight, Activity } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { setVerifiedStatus } from "@/lib/auth-wait";
import { useRole } from "@/hooks/useRole";
import { usePresence } from "@/hooks/usePresence";
import { useChatNotifications } from "@/hooks/useChatNotifications";
import { useNativePush } from "@/hooks/useNativePush";
import { useServerFn } from "@tanstack/react-start";
import { verifyDeposit } from "@/lib/deposit.functions";
import { toast } from "sonner";

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
  const location = useLocation();
  const searchTab = (location.search as any)?.tab || "all";
  const isChatListActive = pathname === "/app/chat" || pathname === "/app/chat/";
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadChatsCount, setUnreadChatsCount] = useState(0);
  const [spamCount, setSpamCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    
    const fetchCounts = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id || !mounted) return;
      const myId = session.user.id;

      // Unread notifications
      const { count: notifCount } = await supabase
        .from("user_notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", myId)
        .eq("seen", false);
      if (notifCount !== null && mounted) setUnreadCount(notifCount);

      // Unread chats
      const { count: chatCount } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("receiver_id", myId)
        .eq("seen", false);
      if (chatCount !== null && mounted) setUnreadChatsCount(chatCount);

      // Spam count
      const { count: sCount } = await supabase
        .from("spam_list")
        .select("id", { count: "exact", head: true })
        .eq("user_id", myId);
      if (sCount !== null && mounted) setSpamCount(sCount);
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 10000);

    const handleUpdate = () => {
      fetchCounts();
    };

    window.addEventListener("unread-notifications-updated", handleUpdate);
    window.addEventListener("jj-message-sent", handleUpdate);

    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener("unread-notifications-updated", handleUpdate);
      window.removeEventListener("jj-message-sent", handleUpdate);
    };
  }, []);

  usePresence();
  useChatNotifications();
  useNativePush();

  const verifyFn = useServerFn(verifyDeposit);

  // Background polling for crypto deposits
  useEffect(() => {
    let mounted = true;
    const interval = setInterval(async () => {
      if (!mounted) return;
      try {
        const res = await verifyFn({ data: {} });
        if (res.success && res.credited && res.credited > 0) {
          toast.success(`You just received $${res.credited.toFixed(2)} in your wallet! 💰`);
          window.dispatchEvent(new CustomEvent("wallet-updated", { detail: { credited: res.credited } }));
        }
      } catch (e) {
        console.warn("[Background Poll] failed:", e);
      }
    }, 30000); // 30 seconds

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [verifyFn]);


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

  const navItems = [
    { to: "/app/chat", icon: MessageCircle, label: "Chats", notificationCount: unreadChatsCount },
    { to: "/app/friends", icon: Users, label: "Friends" },
    { to: "/app/vip-rewards", icon: Crown, label: "VIP Club" },
    { to: "/app/rewards", icon: Gift, label: "Rewards" },
    { to: "/app/wallet", icon: Wallet, label: "Wallet" },
    { to: "/app/refer-earn", icon: Gift, label: "Refer & Earn" },
    { to: "/app/next-goal", icon: Target, label: "Next Goal", badge: "NEW" },
    { to: "/app/notifications", icon: Bell, label: "Notifications", notificationCount: unreadCount },
    { to: "/app/security", icon: Shield, label: "Security" },
    { to: "/app/profile", icon: UserIcon, label: "Profile" },
    { to: "/app/settings", icon: Settings, label: "Settings" },
    { to: "/app/support", icon: HelpCircle, label: "Help & Support" },
  ];

  const allNavItems = [...navItems];
  if (isAdmin) {
    allNavItems.push({ to: "/app/admin", icon: Shield, label: "Admin" });
  }

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
          className="h-9 w-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
        {allNavItems.map((n) => {
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
              <span className="flex-1 text-left">{n.label}</span>
              {n.badge && (
                <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[9px] font-black uppercase tracking-wider border border-primary/20 shrink-0">
                  {n.badge}
                </span>
              )}
              {n.notificationCount !== undefined && n.notificationCount > 0 && (
                <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-blue-600 text-white text-[10px] font-black flex items-center justify-center shrink-0 shadow-sm shadow-blue-600/20">
                  {n.notificationCount}
                </span>
              )}
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
        {/* Sliding overlay drawer menu for desktop and mobile */}
        {open && (
          <div className="fixed inset-0 z-50 flex animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setOpen(false)} />
            <div className="relative z-10 animate-in slide-in-from-left duration-250 ease-out h-full">
              {Drawer}
            </div>
          </div>
        )}

        <main className={`flex-1 min-w-0 min-h-0 flex flex-col safe-pt safe-pb safe-pl safe-pr ${isChatListActive ? "pb-16 md:pb-0" : "pb-0"}`}>
          <OnlineStatusBanner />
          {children}
        </main>

        {/* Bottom navigation bar for mobile layout only (hidden when a specific chat is open) */}
        {isChatListActive && (
          <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/85 backdrop-blur-md border-t border-border/80 h-16 flex items-center justify-around px-4 py-2 safe-pb">
            <Link
              to="/app/chat"
              search={{ tab: "all" }}
              className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold transition-all duration-200 active:scale-95 hover:scale-105 ${
                pathname === "/app/chat" && (searchTab === "all" || (!searchTab || searchTab === "spam"))
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <MessageCircle className="h-5 w-5" />
              <span>Chats</span>
            </Link>

            <Link
              to="/app/chat"
              search={{ tab: "calls" }}
              className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold transition-all duration-200 active:scale-95 hover:scale-105 ${
                pathname === "/app/chat" && searchTab === "calls"
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Phone className="h-5 w-5" />
              <span>Calls</span>
            </Link>

            <Link
              to="/app/chat"
              search={{ tab: "groups" }}
              className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold transition-all duration-200 active:scale-95 hover:scale-105 ${
                pathname === "/app/chat" && searchTab === "groups"
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Users className="h-5 w-5" />
              <span>Groups</span>
            </Link>

            <button
              onClick={() => setMoreOpen(true)}
              className="flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold text-muted-foreground hover:text-foreground focus:outline-none transition-all duration-200 active:scale-95 hover:scale-105"
            >
              <MoreHorizontal className="h-5 w-5" />
              <span>More</span>
            </button>
          </nav>
        )}

        {/* Custom slide-up More Bottom Sheet overlay for responsive/mobile view */}
        {moreOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center animate-in fade-in duration-200">
            {/* Backdrop overlay */}
            <div 
              className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
              onClick={() => setMoreOpen(false)} 
            />
            {/* Slide-up panel container */}
            <div className="relative z-10 w-full max-h-[85vh] bg-card border-t border-border rounded-t-[32px] overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300 ease-out shadow-2xl safe-pb">
              {/* Handlebar decoration */}
              <div className="w-12 h-1.5 bg-muted rounded-full mx-auto my-3 shrink-0" />
              
              {/* Title & Close */}
              <div className="px-5 pb-3 flex items-center justify-between border-b border-border/60 shrink-0">
                <span className="font-extrabold text-base text-foreground font-sans">More Actions</span>
                <button 
                  onClick={() => setMoreOpen(false)}
                  className="h-8 w-8 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center text-muted-foreground transition-all"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>

              {/* Items List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2 select-none">
                {[
                  { to: "/app/notifications", icon: Bell, label: "Announcements", badgeCount: unreadCount },
                  { to: "/app/rewards", icon: Gift, label: "Bonus Center" },
                  { to: "/app/next-goal", icon: Target, label: "My Activity", badge: "NEW" },
                  { to: "/app/chat", search: { tab: "spam" }, icon: Ban, label: "Spam Chats", badgeCount: spamCount },
                  { to: "/app/vip-rewards", icon: Crown, label: "VIP Club" },
                  { to: "/app/wallet", icon: Wallet, label: "Wallet" },
                  { to: "/app/refer-earn", icon: Gift, label: "Refer & Earn" },
                  { to: "/app/security", icon: Shield, label: "Security" },
                  { to: "/app/profile", icon: UserIcon, label: "Profile" },
                  { to: "/app/settings", icon: Settings, label: "Settings" },
                  { to: "/app/support", icon: HelpCircle, label: "Support & FAQ" },
                ].map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={idx}
                      to={item.to}
                      search={item.search}
                      onClick={() => setMoreOpen(false)}
                      className="w-full h-12 rounded-xl flex items-center gap-3 px-3 hover:bg-secondary transition-colors text-left font-sans"
                    >
                      <div className="h-8.5 w-8.5 rounded-full bg-secondary flex items-center justify-center text-muted-foreground/80 shrink-0">
                        <Icon className="h-4.5 w-4.5" />
                      </div>
                      <span className="flex-1 text-sm font-semibold text-foreground leading-tight">{item.label}</span>
                      
                      {item.badge && (
                        <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[8px] font-black uppercase tracking-wider border border-primary/20 shrink-0 font-sans">
                          {item.badge}
                        </span>
                      )}

                      {item.badgeCount !== undefined && item.badgeCount > 0 && (
                        <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-blue-600 text-white text-[10px] font-black flex items-center justify-center shrink-0 shadow-sm shadow-blue-600/20 font-mono">
                          {item.badgeCount}
                        </span>
                      )}

                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                    </Link>
                  );
                })}

                {/* Logout Row */}
                <button
                  onClick={() => {
                    setMoreOpen(false);
                    setConfirmOut(true);
                  }}
                  className="w-full h-12 rounded-xl flex items-center gap-3 px-3 hover:bg-destructive/10 text-destructive transition-colors text-left border-t border-border/40 mt-3 font-sans"
                >
                  <div className="h-8.5 w-8.5 rounded-full bg-destructive/10 flex items-center justify-center text-destructive shrink-0">
                    <LogOut className="h-4.5 w-4.5" />
                  </div>
                  <span className="flex-1 text-sm font-bold leading-tight">Sign out</span>
                  <ChevronRight className="h-4 w-4 text-destructive/40 shrink-0" />
                </button>
              </div>
            </div>
          </div>
        )}

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
      className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-secondary -ml-1 transition-colors"
      aria-label="Open menu"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}
