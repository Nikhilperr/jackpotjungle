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

    const host = window.location.hostname.toLowerCase();
    const pathname = location.pathname;

    const sessionRes = await supabase.auth.getSession();
    const session = sessionRes.data.session;
    const hashParams = session ? `#access_token=${session.access_token}&refresh_token=${session.refresh_token}` : "";

    if (Capacitor.isNativePlatform()) {
      if (pathname === "/" || (!pathname.startsWith("/app/") && !isFrameworkOrAssetPath(pathname))) {
        if (session?.user) {
          const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id);
          const isAdmin = !!roles?.some((r: any) => r.role === "admin" || r.role === "super_admin");
          throw redirect({ to: isAdmin ? "/app/admin" : "/app/chat", search: location.search });
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
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" },
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
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            const t = localStorage.getItem('theme') || 'jackpot';
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
    // Run database auto-migrations on load
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
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        toast.info("Password recovery link detected. Set your new password.");
        navigate({ to: "/reset-password" });
        return;
      }
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
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
