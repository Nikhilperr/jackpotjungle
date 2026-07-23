import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { initViewportHeightLock } from "@/lib/native/viewport-height";
import { getRouter } from "./router";
import "./styles.css";

// Start before React mounts — keyboard height must track from the first focus.
initViewportHeightLock();

const VPS_ORIGIN = "https://chat.playjackpotjungle.com";

(window as any).__TSS_START_OPTIONS__ = {
  functionMiddleware: [attachSupabaseAuth],
};

if (typeof window !== "undefined") {
  const originalFetch = window.fetch.bind(window);
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    let isServerFn = false;
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        isServerFn =
          init.headers.has("x-tsr-serverFn") || init.headers.has("x-tsr-serverfn");
      } else if (Array.isArray(init.headers)) {
        isServerFn = init.headers.some(
          ([k]) => k.toLowerCase() === "x-tsr-serverfn",
        );
      } else {
        const h = init.headers as Record<string, string>;
        isServerFn = !!(h["x-tsr-serverFn"] || h["x-tsr-serverfn"]);
      }
    }

    if (isServerFn) {
      let remoteUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;

      if (remoteUrl.startsWith("/")) {
        remoteUrl = VPS_ORIGIN + remoteUrl;
      } else {
        try {
          const u = new URL(remoteUrl);
          if (
            u.pathname.startsWith("/_serverFn") &&
            (u.hostname === "localhost" ||
              u.hostname === "127.0.0.1" ||
              u.protocol === "file:" ||
              u.hostname === "" ||
              u.origin === "null" ||
              u.origin === window.location.origin)
          ) {
            remoteUrl = VPS_ORIGIN + u.pathname + u.search;
          }
        } catch {
          /* keep */
        }
      }
      return originalFetch(remoteUrl, init);
    }
    return originalFetch(input, init);
  };
}

const router = getRouter();

// Failsafe: never leave native splash up forever if a screen fails to signal.
window.setTimeout(() => {
  if (!(window as any).__jjAppReadyFired) {
    (window as any).__jjAppReadyFired = true;
    window.dispatchEvent(new Event("jj-app-ready"));
  }
}, 4000);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <RouterProvider router={router} />,
);
