import { isNative, getSafePlugin } from "./utils";
import { toast } from "sonner";

const NetworkStub = {
  getStatus: () => Promise.resolve({ connected: true, connectionType: "wifi" }),
  addListener: (event: string, callback: any) => {
    return Promise.resolve({ remove: () => {} });
  }
};

const Network = getSafePlugin("Network", NetworkStub);
let offlineToastId: string | number | null = null;

export async function initNetworkMonitoring(router: any) {
  if (!isNative()) return;

  // 1. Initial check
  const status = await Network.getStatus();
  handleNetworkChange(status.connected, router);

  // 2. Continuous listener
  Network.addListener("networkStatusChange", (change: { connected: boolean }) => {
    handleNetworkChange(change.connected, router);
  });
}

function handleNetworkChange(connected: boolean, router: any) {
  if (connected) {
    if (offlineToastId !== null) {
      toast.dismiss(offlineToastId);
      offlineToastId = null;
      toast.success("Back online!", {
        duration: 3000,
        position: "top-center"
      });
      // Invalidate query client queries or refresh router context
      if (router) {
        router.invalidate();
      }
    }
  } else {
    if (offlineToastId === null) {
      offlineToastId = toast.error("Connection lost. Reconnecting...", {
        duration: Infinity,
        position: "top-center",
        dismissible: false
      });
    }
  }
}
