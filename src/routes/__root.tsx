import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useNavigate,
  HeadContent,
  Scripts,
  redirect,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { runAutoDatabaseMigrations } from "@/lib/admin-super.functions";
import { Capacitor } from "@capacitor/core";
import { getSharedInitialSession, clearSharedSessionCache } from "@/lib/auth-wait";
import { initializeNativeBridge } from "@/lib/native";



function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist.
        </p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="max-w-xl text-center flex flex-col items-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">Try again or head back home.</p>
        
        {error && (
          <div className="mt-5 w-full text-left bg-secondary/40 border border-border p-4 rounded-2xl max-h-72 overflow-y-auto select-text">
            <p className="text-xs font-bold text-destructive font-mono break-all leading-relaxed">
              Error: {error.message || String(error)}
            </p>
            {error.stack && (
              <pre className="text-[10px] text-muted-foreground mt-3 font-mono whitespace-pre-wrap leading-normal overflow-x-auto border-t border-border/50 pt-2.5">
                {error.stack}
              </pre>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >Try again</button>
          <a href="/" className="inline-flex items-center justify-center rounded-full border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-accent">Go home</a>
        </div>
      </div>
    </div>
  );
}

function isFrameworkOrAssetPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_server") ||
    pathname.startsWith("/_build") ||
    pathname.startsWith("/_nitro") ||
    pathname.startsWith("/_telemetry") ||
    pathname === "/favicon.ico" ||
    pathname.includes(".")
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async ({ location }) => {
    if (typeof window === "undefined") return;

    const pathname = location.pathname;
    if (pathname.startsWith("/app/") && pathname !== "/app/") {
      return;
    }

    const host = window.location.hostname.toLowerCase();

    const session = await getSharedInitialSession();
    const hashParams = session ? `#access_token=${session.access_token}&refresh_token=${session.refresh_token}` : "";

    // ── Restore last route on cold boot/root load if logged in ───────────────
    if (pathname === "/" || (!pathname.startsWith("/app/") && !isFrameworkOrAssetPath(pathname))) {
      if (session?.user) {
        if (typeof window !== "undefined") {
          try {
            const lastRoute = localStorage.getItem("chancerealm_last_route");
            if (lastRoute && lastRoute !== "/" && !lastRoute.includes("/auth") && !lastRoute.includes("/reset-password")) {
              console.log("[__root beforeLoad] Restoring last active route on startup:", lastRoute);
              throw redirect({ to: lastRoute, search: location.search });
            }
          } catch (e) {
            if (e && typeof e === "object" && "to" in e) {
              throw e;
            }
          }
        }
      }
    }

    if (Capacitor.isNativePlatform()) {
      if (pathname === "/" || (!pathname.startsWith("/app/") && !isFrameworkOrAssetPath(pathname))) {
        if (session?.user) {
          // Native-first: never block cold boot on a user_roles network round-trip.
          // Prefer cached role; default to chat and refresh role in the background.
          const cachedRole =
            typeof window !== "undefined" ? localStorage.getItem("jj_user_role") : null;
          if (cachedRole === "admin" || cachedRole === "super_admin") {
            throw redirect({ to: "/app/admin", search: location.search });
          }
          if (!cachedRole) {
            void supabase
              .from("user_roles")
              .select("role")
              .eq("user_id", session.user.id)
              .then(({ data: roles }) => {
                const userRole = roles?.[0]?.role || "user";
                try {
                  localStorage.setItem("jj_user_role", userRole);
                } catch {
                  /* ignore */
                }
              });
          }
          throw redirect({ to: "/app/chat", search: location.search });
        } else {
          throw redirect({ to: "/app/auth", search: location.search });
        }
      }
      return;
    }

    // Subdomain routing rules
    if (host.startsWith("admin.")) {
      // Admin subdomain
      if (pathname === "/" || (!pathname.startsWith("/app/") && !isFrameworkOrAssetPath(pathname))) {
        throw redirect({ to: "/app/admin", search: location.search });
      }
      if (pathname.startsWith("/app/chat") || pathname.startsWith("/app/friends") || pathname.startsWith("/app/profile") || pathname.startsWith("/app/onboarding")) {
        throw redirect({ href: `https://chat.playjackpotjungle.com${pathname}${location.searchStr}${hashParams}` });
      }
      if (pathname === "/vip" || pathname === "/rewards" || pathname === "/promotions" || pathname === "/leaderboard" || pathname === "/referrals" || pathname === "/support" || pathname === "/faq" || pathname === "/blog" || pathname === "/privacy" || pathname === "/terms" || pathname === "/download") {
        throw redirect({ href: `https://playjackpotjungle.com${pathname}${location.searchStr}` });
      }
    } else if (host.startsWith("chat.")) {
      // Chat subdomain
      if (pathname === "/" || (!pathname.startsWith("/app/") && !isFrameworkOrAssetPath(pathname))) {
        throw redirect({ to: "/app/chat", search: location.search });
      }
      if (pathname.startsWith("/app/admin")) {
        throw redirect({ href: `https://admin.playjackpotjungle.com${pathname}${location.searchStr}${hashParams}` });
      }
      if (pathname === "/vip" || pathname === "/rewards" || pathname === "/promotions" || pathname === "/leaderboard" || pathname === "/referrals" || pathname === "/support" || pathname === "/faq" || pathname === "/blog" || pathname === "/privacy" || pathname === "/terms" || pathname === "/download") {
        throw redirect({ href: `https://playjackpotjungle.com${pathname}${location.searchStr}` });
      }
    } else if (host.startsWith("api.")) {
      // Fallback redirect for API subdomain (e.g. if OAuth callbacks land here)
      if (pathname.startsWith("/app/admin")) {
        throw redirect({ href: `https://admin.playjackpotjungle.com${pathname}${location.searchStr}${hashParams}` });
      } else {
        throw redirect({ href: `https://chat.playjackpotjungle.com${pathname}${location.searchStr}${hashParams}` });
      }
    } else {
      // Primary domain (playjackpotjungle.com)
      if (pathname.startsWith("/app/admin")) {
        throw redirect({ href: `https://admin.playjackpotjungle.com${pathname}${location.searchStr}${hashParams}` });
      }
      if (pathname.startsWith("/app/chat") || pathname.startsWith("/app/friends") || pathname.startsWith("/app/profile") || pathname.startsWith("/app/onboarding") || pathname.startsWith("/app/auth")) {
        throw redirect({ href: `https://chat.playjackpotjungle.com${pathname}${location.searchStr}${hashParams}` });
      }
    }
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" },
      { title: "Jackpot Jungle Messenger" },
      { name: "description", content: "Private real-time chat for the Jackpot Jungle community." },
      { property: "og:title", content: "Jackpot Jungle Messenger" },
      { name: "twitter:title", content: "Jackpot Jungle Messenger" },
      { property: "og:description", content: "Private real-time chat for the Jackpot Jungle community." },
      { name: "twitter:description", content: "Private real-time chat for the Jackpot Jungle community." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/3b60700a-6191-4115-ae1c-a83f871c2482" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/3b60700a-6191-4115-ae1c-a83f871c2482" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
      { name: "cryptomus", content: "3f5b6bcf" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/webp", href: "/icons/icon-256.webp" }
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  // Capacitor boots via client-only ReactDOM.createRoot(#root). Nesting a full
  // <html>/<body>/<Scripts/> document shell inside that div made Android
  // WebView's CrRendererMain spin at ~100% CPU (login input freeze). Use a
  // fragment shell on native; keep the document shell for web/SSR.
  if (typeof window !== "undefined" && Capacitor.isNativePlatform()) {
    return <>{children}</>;
  }

  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            const t = localStorage.getItem('theme') || 'amoled';
            document.documentElement.classList.add(t);
          } catch (e) {}
        ` }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const navigate = useNavigate();

  useEffect(() => {
    // Native-first: never hit the VPS migration serverFn on APK cold start.
    // Super-admin maintenance still runs migrations from the admin UI.
    if (Capacitor.isNativePlatform()) return;

    runAutoDatabaseMigrations()
      .then((r: any) => {
        if (r && !r.success) {
          console.warn("[AutoMigration Warning]:", r.error);
        } else {
          console.log("[AutoMigration Success]:", r);
        }
      })
      .catch((err) => {
        console.error("[AutoMigration Error]:", err.message || err);
      });
  }, []);

  useEffect(() => {
    initializeNativeBridge(router);
  }, [router]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).onNativeRouteReceived = (path: string) => {
        console.log("[__root.tsx] Received native route dispatch:", path);
        let cleanPath = path;
        try {
          if (path.includes("://")) {
            const urlObj = new URL(path);
            cleanPath = urlObj.pathname + urlObj.search + urlObj.hash;
          }
        } catch (e) {
          console.error("[__root.tsx] Failed to parse path URL:", e);
        }
        router.history.push(cleanPath);
      };
    }
    return () => {
      if (typeof window !== "undefined") {
        delete (window as any).onNativeRouteReceived;
      }
    };
  }, [router]);

  useEffect(() => {
    let lastUserId: string | null = null;

    // Set initial lastUserId from current session on mount
    getSharedInitialSession().then((session) => {
      lastUserId = session?.user?.id ?? null;
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        toast.info("Password recovery link detected. Set your new password.");
        navigate({ to: "/reset-password" });
        return;
      }
      if (event === "SIGNED_OUT") {
        clearSharedSessionCache();
        if (typeof window !== "undefined") {
          localStorage.removeItem("jj_user_role");
          // Logout flow navigates with location.replace — skip invalidate races
          // that paint a blank authenticated shell (looks like the app closed).
          if (
            sessionStorage.getItem("jj_signing_out") === "1" ||
            window.location.pathname.startsWith("/app/auth")
          ) {
            return;
          }
        }
      }
      // Do not clear session cache or invalidate on TOKEN_REFRESHED — that
      // re-runs every beforeLoad and flashes loading ↔ chats on native.
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;

      const currentUserId = session?.user?.id ?? null;
      if (currentUserId === lastUserId && event !== "SIGNED_OUT") {
        // Skip invalidation if the user session has not actually changed
        return;
      }

      lastUserId = currentUserId;

      // On SIGNED_IN: auth.tsx already calls navigate() explicitly after verifying the user.
      // Triggering router.invalidate() here races with that navigation and causes the
      // authenticated route guard to re-run before setVerifiedStatus(true) has settled,
      // which bounces the user back to /app/auth and forces a second login attempt.
      if (event === "SIGNED_IN") {
        queryClient.invalidateQueries();
        return;
      }

      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient, navigate]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster />
    </QueryClientProvider>
  );
}
