import { Link, useNavigate, useRouterState, useRouter, useLocation } from "@tanstack/react-router";
import { MessageCircle, Users, User as UserIcon, LogOut, Shield, Menu, X, Wifi, WifiOff, Wallet, Award, Trophy, Gift, Phone, MoreHorizontal, Coins, Crown, Target, Bell, Settings, HelpCircle, Ban, Share2, Star, Info, ChevronRight, Activity, Loader2 } from "lucide-react";
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

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { SignOutDialog } from "@/components/messenger/SignOutDialog";
import { Capacitor } from "@capacitor/core";
import { runAfterFirstPaint } from "@/lib/native/defer";
import { NetworkManager, type NetworkStatus } from "@/lib/network-manager";
import { registerBackAction } from "@/lib/native/navigation";
import { NativeSideDrawer } from "@/components/messenger/NativeSideDrawer";

const DrawerCtx = createContext<{ open: () => void }>({ open: () => {} });
export const useAppDrawer = () => useContext(DrawerCtx);

function OnlineStatusBanner() {
  const [status, setStatus] = useState<NetworkStatus>(() => {
    return typeof window !== "undefined" ? NetworkManager.getStatus() : "online";
  });
  const [showConnected, setShowConnected] = useState(false);

  useEffect(() => {
    let lastStatus = typeof window !== "undefined" ? NetworkManager.getStatus() : "online";
    const unsubscribe = NetworkManager.subscribe((newStatus) => {
      setStatus(newStatus);
      if (
        newStatus === "online" &&
        (lastStatus === "offline" || lastStatus === "poor" || lastStatus === "reconnecting")
      ) {
        setShowConnected(true);
        const timer = setTimeout(() => {
          setShowConnected(false);
        }, 3000);
        return () => clearTimeout(timer);
      }
      if (newStatus !== "online") {
        setShowConnected(false);
      }
      lastStatus = newStatus;
    });

    return () => {
      unsubscribe();
    };
  }, []);

  if (status === "offline") {
    return (
      <div className="bg-amber-600 dark:bg-amber-700 text-white text-xs font-semibold py-1.5 px-4 flex items-center justify-center gap-1.5 animate-in slide-in-from-top duration-200 shadow-sm shrink-0 select-none">
        <WifiOff className="h-3.5 w-3.5" />
        <span>No internet connection · Actions will be queued</span>
      </div>
    );
  }

  if (status === "poor") {
    return (
      <div className="bg-orange-600 dark:bg-orange-700 text-white text-xs font-semibold py-1.5 px-4 flex items-center justify-center gap-1.5 animate-in slide-in-from-top duration-200 shadow-sm shrink-0 select-none">
        <Activity className="h-3.5 w-3.5 animate-pulse" />
        <span>Slow/unstable connection detected · Retrying...</span>
      </div>
    );
  }

  if (status === "reconnecting") {
    return (
      <div className="bg-blue-600 dark:bg-blue-700 text-white text-xs font-semibold py-1.5 px-4 flex items-center justify-center gap-1.5 animate-in slide-in-from-top duration-200 shadow-sm shrink-0 select-none">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>Reconnecting to Jackpot Jungle...</span>
      </div>
    );
  }

  if (showConnected) {
    return (
      <div className="bg-emerald-600 dark:bg-emerald-700 text-white text-xs font-semibold py-1.5 px-4 flex items-center justify-center gap-1.5 animate-in slide-in-from-top exit-to-top duration-300 shadow-sm shrink-0 select-none">
        <Wifi className="h-3.5 w-3.5" />
        <span>Connection restored! Syncing offline queues...</span>
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
  const showBottomBar = !pathname.startsWith("/app/chat/") && !pathname.startsWith("/app/deposit");
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const closeDrawer = useCallback(() => setOpen(false), []);
  const closeMore = useCallback(() => setMoreOpen(false), []);

  // Android back closes overlays before navigating (Messenger-style).
  useEffect(() => {
    if (!moreOpen) return;
    return registerBackAction(() => {
      setMoreOpen(false);
      return true;
    }, 90);
  }, [moreOpen]);

  useEffect(() => {
    if (!confirmOut) return;
    return registerBackAction(() => {
      setConfirmOut(false);
      return true;
    }, 110);
  }, [confirmOut]);
  const [unreadCount, setUnreadCount] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    try {
      return Number(localStorage.getItem("jj_cached_counts_notif") || 0);
    } catch {
      return 0;
    }
  });
  const [unreadChatsCount, setUnreadChatsCount] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    try {
      return Number(localStorage.getItem("jj_cached_counts_chats") || 0);
    } catch {
      return 0;
    }
  });
  const [spamCount, setSpamCount] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    try {
      return Number(localStorage.getItem("jj_cached_counts_spam") || 0);
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    let mounted = true;
    let channel: any = null;
    
    const fetchCounts = async (myId: string) => {
      if (!mounted) return;

      // Unread notifications
      const { count: notifCount } = await supabase
        .from("user_notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", myId)
        .eq("seen", false);
      if (notifCount !== null && mounted) {
        setUnreadCount(notifCount);
        try {
          localStorage.setItem("jj_cached_counts_notif", String(notifCount));
        } catch {}
      }

      // Unread chats
      const { count: chatCount } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("receiver_id", myId)
        .eq("seen", false);
      if (chatCount !== null && mounted) {
        setUnreadChatsCount(chatCount);
        try {
          localStorage.setItem("jj_cached_counts_chats", String(chatCount));
        } catch {}
      }

      // Spam count
      const { count: sCount } = await supabase
        .from("spam_list")
        .select("id", { count: "exact", head: true })
        .eq("user_id", myId);
      if (sCount !== null && mounted) {
        setSpamCount(sCount);
        try {
          localStorage.setItem("jj_cached_counts_spam", String(sCount));
        } catch {}
      }
    };

    let userId = "";

    const setup = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id || !mounted) return;
      userId = session.user.id;
      
      await fetchCounts(userId);

      const rand = Math.random().toString(36).slice(2, 9);
      channel = supabase
        .channel(`badging-realtime-${rand}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          (payload) => {
            const m = payload.new as any;
            if (m && m.receiver_id === userId && !m.seen) {
              setUnreadChatsCount((prev) => {
                const next = prev + 1;
                try { localStorage.setItem("jj_cached_counts_chats", String(next)); } catch {}
                return next;
              });
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "messages" },
          (payload) => {
            const m = payload.new as any;
            if (m && m.receiver_id === userId) {
              fetchCounts(userId);
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "user_notifications" },
          (payload) => {
            const fresh = payload.new as any;
            const old = payload.old as any;
            if (payload.eventType === "INSERT" && fresh && fresh.user_id === userId && !fresh.seen) {
              setUnreadCount((prev) => {
                const next = prev + 1;
                try { localStorage.setItem("jj_cached_counts_notif", String(next)); } catch {}
                return next;
              });
            } else if (payload.eventType === "UPDATE" && fresh && fresh.user_id === userId) {
              fetchCounts(userId);
            } else if (payload.eventType === "DELETE" && old) {
              fetchCounts(userId);
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "spam_list" },
          () => {
            fetchCounts(userId);
          }
        )
        .subscribe();
    };

    setup();
    const interval = setInterval(() => {
      if (userId) fetchCounts(userId);
    }, 30000); // 30 seconds fallback polling

    const handleUpdate = () => {
      if (userId) fetchCounts(userId);
    };

    const handleFocus = () => {
      if (document.visibilityState === "visible") {
        console.log("[AppShell] App returned to foreground, syncing offline queues...");
        NetworkManager.processQueues();
      }
    };

    window.addEventListener("unread-notifications-updated", handleUpdate);
    window.addEventListener("jj-message-sent", handleUpdate);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      mounted = false;
      clearInterval(interval);
      if (channel) supabase.removeChannel(channel);
      window.removeEventListener("unread-notifications-updated", handleUpdate);
      window.removeEventListener("jj-message-sent", handleUpdate);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, []);

  usePresence();
  useChatNotifications();
  useNativePush();

  const verifyFn = useServerFn(verifyDeposit);

  // Background polling for crypto deposits — deferred so it never contends with first paint.
  useEffect(() => {
    let mounted = true;
    let interval: ReturnType<typeof setInterval> | null = null;
    const cancel = runAfterFirstPaint(() => {
      if (!mounted) return;
      interval = setInterval(async () => {
        if (!mounted) return;
        try {
          const res = await verifyFn({ data: {} });
          if (res.success && res.credited && res.credited > 0) {
            toast.success(`You just received $${res.credited.toFixed(2)} in your wallet!`);
            window.dispatchEvent(new CustomEvent("wallet-updated", { detail: { credited: res.credited } }));
          }
        } catch (e) {
          console.warn("[Background Poll] failed:", e);
        }
      }, 30000);
    }, 2500);

    return () => {
      mounted = false;
      cancel();
      if (interval) clearInterval(interval);
    };
  }, [verifyFn]);


  async function signOut() {
    const { performSignOut } = await import("@/lib/sign-out");
    await performSignOut(qc, (opts) => navigate(opts));
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
    <aside data-jj-drawer-panel className="w-72 h-full bg-card border-r border-border flex flex-col">
      <div className="px-4 py-4 flex items-center gap-3 border-b border-border min-h-14">
        <img src="/icons/icon-192.webp" alt="Logo" className="h-10 w-10 rounded-xl mb-0 shadow-sm object-cover" />
        <div className="flex-1 min-w-0">
          <p className="font-bold truncate">Jackpot Jungle</p>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Messenger</p>
        </div>
        <button
          onClick={closeDrawer}
          className="touch-target rounded-lg flex items-center justify-center text-muted-foreground active:bg-secondary transition-colors"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto overscroll-contain">
        {allNavItems.map((n) => {
          const active = pathname.startsWith(n.to);
          return (
            <Link
              key={n.to}
              to={n.to}
              onClick={closeDrawer}
              className={`w-full min-h-12 rounded-xl flex items-center gap-3 px-3 text-sm font-medium transition-colors active:scale-[0.99] ${
                active ? "bg-primary/10 text-primary" : "text-muted-foreground active:bg-secondary active:text-foreground"
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
          onClick={() => {
            closeDrawer();
            setConfirmOut(true);
          }}
          className="flex-1 min-h-12 rounded-xl flex items-center gap-3 px-3 text-sm font-medium text-muted-foreground active:bg-destructive/10 active:text-destructive"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );

  const isNative = Capacitor.isNativePlatform();

  return (
    <DrawerCtx.Provider value={{ open: () => setOpen(true) }}>
      {/* Height from visualViewport/--jj-app-height on native — header stays pinned with keyboard */}
      <div className="flex h-full max-h-full bg-background native-safe-shell overflow-hidden">
        <NativeSideDrawer open={open} onClose={closeDrawer}>
          {Drawer}
        </NativeSideDrawer>

        {/* Shell already clears status/nav via native-safe-shell; bottom nav adds its own height. */}
        <main
          className={`flex-1 min-w-0 min-h-0 flex flex-col ${
            showBottomBar ? "pb-16 md:pb-0" : ""
          }`}
        >
          <OnlineStatusBanner />
          {children}
        </main>

        {/* Bottom navigation — solid on native (no blur jank), 48dp-friendly targets */}
        {showBottomBar && (
          <nav className={`md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border/80 min-h-16 flex items-stretch justify-around px-1 pt-1 ${
            isNative ? "bg-background" : "bg-background/90 backdrop-blur-md"
          }`} style={{ paddingBottom: "max(0px, var(--jj-sab, 0px))" }}>
            <Link
              to="/app/chat"
              search={{ tab: "all" }}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-bold transition-colors duration-150 active:opacity-80 min-h-12 ${
                pathname === "/app/chat" && (searchTab === "all" || (!searchTab || searchTab === "spam"))
                  ? "text-primary"
                  : "text-muted-foreground"
              }`}
            >
              <MessageCircle className="h-5 w-5" />
              <span>Chats</span>
            </Link>

            <Link
              to="/app/chat"
              search={{ tab: "calls" }}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-bold transition-colors duration-150 active:opacity-80 min-h-12 ${
                pathname === "/app/chat" && searchTab === "calls"
                  ? "text-primary"
                  : "text-muted-foreground"
              }`}
            >
              <Phone className="h-5 w-5" />
              <span>Calls</span>
            </Link>

            <Link
              to="/app/chat"
              search={{ tab: "groups" }}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-bold transition-colors duration-150 active:opacity-80 min-h-12 ${
                pathname === "/app/chat" && searchTab === "groups"
                  ? "text-primary"
                  : "text-muted-foreground"
              }`}
            >
              <Users className="h-5 w-5" />
              <span>Groups</span>
            </Link>

            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-bold text-muted-foreground focus:outline-none transition-colors duration-150 active:opacity-80 min-h-12"
            >
              <MoreHorizontal className="h-5 w-5" />
              <span>More</span>
            </button>
          </nav>
        )}

        {/* More bottom sheet — solid dim on native, 48dp close */}
        {moreOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center animate-in fade-in duration-150">
            <div
              className={`absolute inset-0 ${isNative ? "bg-black/55" : "bg-black/60 backdrop-blur-sm"}`}
              onClick={closeMore}
            />
            <div className="relative z-10 w-full max-h-[min(85dvh,85vh)] bg-card border-t border-border rounded-t-[28px] overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-200 ease-out shadow-2xl safe-pb">
              <div className="w-12 h-1.5 bg-muted rounded-full mx-auto my-3 shrink-0" />
              
              <div className="px-5 pb-3 flex items-center justify-between border-b border-border/60 shrink-0">
                <span className="font-extrabold text-base text-foreground font-sans">More Actions</span>
                <button
                  type="button"
                  onClick={closeMore}
                  className="touch-target rounded-full bg-secondary active:bg-secondary/80 flex items-center justify-center text-muted-foreground"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Items List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2 select-none">
                {[
                  { to: "/app/next-goal", icon: Activity, label: "My Activity" },
                  { to: "/app/support", icon: Phone, label: "Support" },
                  { to: "/app/help", icon: HelpCircle, label: "Help & FAQ" },
                  { onClick: () => toast.info("Rate App feature will be available once the app is published! 🚀"), icon: Star, label: "Rate App" },
                  { onClick: () => toast.info("Share App feature will be available once the app is published! 📢"), icon: Share2, label: "Share App" },
                  { to: "/app/about", icon: Info, label: "About Us" },
                ].map((item, idx) => {
                  const Icon = item.icon;
                  if (item.to) {
                    return (
                      <Link
                        key={idx}
                        to={item.to}
                        onClick={closeMore}
                        className="w-full min-h-12 rounded-xl flex items-center gap-3 px-3 active:bg-secondary transition-colors text-left font-sans"
                      >
                        <div className="h-8.5 w-8.5 rounded-full bg-secondary flex items-center justify-center text-muted-foreground/80 shrink-0">
                          <Icon className="h-4.5 w-4.5" />
                        </div>
                        <span className="flex-1 text-sm font-semibold text-foreground leading-tight">{item.label}</span>
                        {item.badgeCount !== undefined && item.badgeCount > 0 && (
                          <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-blue-600 text-white text-[10px] font-black flex items-center justify-center shrink-0 shadow-sm shadow-blue-600/20 font-mono">
                            {item.badgeCount}
                          </span>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                      </Link>
                    );
                  } else {
                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          closeMore();
                          item.onClick?.();
                        }}
                        className="w-full min-h-12 rounded-xl flex items-center gap-3 px-3 active:bg-secondary transition-colors text-left font-sans"
                      >
                        <div className="h-8.5 w-8.5 rounded-full bg-secondary flex items-center justify-center text-muted-foreground/80 shrink-0">
                          <Icon className="h-4.5 w-4.5" />
                        </div>
                        <span className="flex-1 text-sm font-semibold text-foreground leading-tight">{item.label}</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                      </button>
                    );
                  }
                })}
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
      type="button"
      onClick={open}
      className="touch-target rounded-xl flex items-center justify-center active:bg-secondary -ml-1 transition-colors"
      aria-label="Open menu"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}
