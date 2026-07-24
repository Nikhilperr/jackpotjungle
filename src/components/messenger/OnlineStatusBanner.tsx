import { useEffect, useRef, useState } from "react";
import { Wifi, WifiOff, Activity, Loader2 } from "lucide-react";
import { NetworkManager, type NetworkStatus } from "@/lib/network-manager";

/**
 * Global offline / poor-connection banner for user, admin, and super-admin shells.
 */
export function OnlineStatusBanner() {
  const [status, setStatus] = useState<NetworkStatus>(() => {
    return typeof window !== "undefined" ? NetworkManager.getStatus() : "online";
  });
  const [showConnected, setShowConnected] = useState(false);
  const lastStatusRef = useRef<NetworkStatus>(status);
  const connectedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = NetworkManager.subscribe((newStatus) => {
      setStatus(newStatus);
      const prev = lastStatusRef.current;
      lastStatusRef.current = newStatus;

      if (connectedTimerRef.current) {
        clearTimeout(connectedTimerRef.current);
        connectedTimerRef.current = null;
      }

      if (
        newStatus === "online" &&
        (prev === "offline" || prev === "poor" || prev === "reconnecting")
      ) {
        setShowConnected(true);
        connectedTimerRef.current = setTimeout(() => {
          setShowConnected(false);
          connectedTimerRef.current = null;
        }, 3000);
        return;
      }

      if (newStatus !== "online") {
        setShowConnected(false);
      }
    });

    // Immediate health check when banner mounts (admin/user shells).
    void NetworkManager.forceHealthCheck();

    return () => {
      unsubscribe();
      if (connectedTimerRef.current) clearTimeout(connectedTimerRef.current);
    };
  }, []);

  if (status === "offline") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="bg-amber-600 dark:bg-amber-700 text-white text-xs font-semibold py-1.5 px-4 flex items-center justify-center gap-1.5 animate-in slide-in-from-top duration-200 shadow-sm shrink-0 select-none z-30"
      >
        <WifiOff className="h-3.5 w-3.5 shrink-0" />
        <span>No internet connection · Messages will send when back online</span>
      </div>
    );
  }

  if (status === "poor") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="bg-orange-600 dark:bg-orange-700 text-white text-xs font-semibold py-1.5 px-4 flex items-center justify-center gap-1.5 animate-in slide-in-from-top duration-200 shadow-sm shrink-0 select-none z-30"
      >
        <Activity className="h-3.5 w-3.5 animate-pulse shrink-0" />
        <span>Slow/unstable connection detected · Retrying...</span>
      </div>
    );
  }

  if (status === "reconnecting") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="bg-blue-600 dark:bg-blue-700 text-white text-xs font-semibold py-1.5 px-4 flex items-center justify-center gap-1.5 animate-in slide-in-from-top duration-200 shadow-sm shrink-0 select-none z-30"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
        <span>Reconnecting to Jackpot Jungle...</span>
      </div>
    );
  }

  if (showConnected) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="bg-emerald-600 dark:bg-emerald-700 text-white text-xs font-semibold py-1.5 px-4 flex items-center justify-center gap-1.5 animate-in slide-in-from-top duration-300 shadow-sm shrink-0 select-none z-30"
      >
        <Wifi className="h-3.5 w-3.5 shrink-0" />
        <span>Connection restored · Syncing...</span>
      </div>
    );
  }

  return null;
}
