import { useEffect, useRef, useState } from "react";
import { Wifi, WifiOff, Loader2, Shield } from "lucide-react";
import { NetworkManager, type NetworkStatus } from "@/lib/network-manager";

/**
 * Global connection banner for user / admin / super-admin.
 * Offline + reconnecting only when internet is actually down.
 * VPN shows a calm info notice — never "retrying".
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
        (newStatus === "online" || newStatus === "vpn") &&
        (prev === "offline" || prev === "reconnecting")
      ) {
        setShowConnected(true);
        connectedTimerRef.current = setTimeout(() => {
          setShowConnected(false);
          connectedTimerRef.current = null;
        }, 2500);
        return;
      }

      if (newStatus === "offline" || newStatus === "reconnecting") {
        setShowConnected(false);
      }
    });

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

  if (status === "reconnecting") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="bg-blue-600 dark:bg-blue-700 text-white text-xs font-semibold py-1.5 px-4 flex items-center justify-center gap-1.5 animate-in slide-in-from-top duration-200 shadow-sm shrink-0 select-none z-30"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
        <span>Reconnecting · Waiting for internet...</span>
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
        <span>Internet restored · Syncing...</span>
      </div>
    );
  }

  if (status === "vpn") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="bg-slate-700 dark:bg-slate-800 text-white text-xs font-semibold py-1.5 px-4 flex items-center justify-center gap-1.5 animate-in slide-in-from-top duration-200 shadow-sm shrink-0 select-none z-30"
      >
        <Shield className="h-3.5 w-3.5 shrink-0" />
        <span>VPN connected · You are online</span>
      </div>
    );
  }

  return null;
}
