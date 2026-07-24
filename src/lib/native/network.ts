import { isNative, getSafePlugin } from "./utils";
import { NetworkManager } from "@/lib/network-manager";
import { toast } from "sonner";

const NetworkStub = {
  getStatus: () => Promise.resolve({ connected: true, connectionType: "wifi" }),
  addListener: (_event: string, _callback: any) => {
    return Promise.resolve({ remove: () => {} });
  },
};

const Network = getSafePlugin("Network", NetworkStub);
let offlineToastId: string | number | null = null;

export async function initNetworkMonitoring(_router: any) {
  // Drive the shared banner (user + admin) from browser online/offline always.
  if (typeof window !== "undefined") {
    const onOffline = () => NetworkManager.reportNativeOffline();
    const onOnline = () => NetworkManager.reportNativeOnline();
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
  }

  if (!isNative()) return;

  // Capacitor Network plugin — faster than waiting for the 20s health ping.
  try {
    const status = await Network.getStatus();
    handleNetworkChange(!!status.connected);
  } catch {
    /* plugin optional */
  }

  Network.addListener("networkStatusChange", (change: { connected: boolean }) => {
    handleNetworkChange(!!change.connected);
  });
}

function handleNetworkChange(connected: boolean) {
  if (connected) {
    NetworkManager.reportNativeOnline();
    if (offlineToastId !== null) {
      toast.dismiss(offlineToastId);
      offlineToastId = null;
      toast.success("Back online!", {
        duration: 3000,
        position: "top-center",
      });
    }
  } else {
    NetworkManager.reportNativeOffline();
    if (offlineToastId === null) {
      offlineToastId = toast.error("Connection lost. Reconnecting...", {
        duration: Infinity,
        position: "top-center",
        dismissible: false,
      });
    }
  }
}
