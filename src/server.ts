import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

import { initRealtimeListeners } from "./lib/realtime-listener.server";

// Prevent duplicate realtime connections during hot-reloads in local dev mode.
if (!(globalThis as any).__realtimeListenerInitialized) {
  (globalThis as any).__realtimeListenerInitialized = true;
  initRealtimeListeners().catch((err) => {
    console.error("[Realtime Listener] Failed to initialize background listener:", err);
  });
}

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
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

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      const hostHeader = request.headers.get("host") || "";
      const host = hostHeader.toLowerCase().split(":")[0];
      const pathname = url.pathname;

      // Subdomain routing rules
      if (host.startsWith("admin.")) {
        if (pathname === "/" || (!pathname.startsWith("/app/") && !isFrameworkOrAssetPath(pathname))) {
          return Response.redirect(`https://admin.playjackpotjungle.com/app/admin${url.search}`, 302);
        }
        if (pathname.startsWith("/app/chat") || pathname.startsWith("/app/friends") || pathname.startsWith("/app/profile") || pathname.startsWith("/app/onboarding")) {
          return Response.redirect(`https://chat.playjackpotjungle.com${pathname}${url.search}`, 302);
        }
        if (pathname === "/vip" || pathname === "/rewards" || pathname === "/promotions" || pathname === "/leaderboard" || pathname === "/referrals" || pathname === "/support" || pathname === "/faq" || pathname === "/blog" || pathname === "/privacy" || pathname === "/terms" || pathname === "/download") {
          return Response.redirect(`https://playjackpotjungle.com${pathname}${url.search}`, 302);
        }
      } else if (host.startsWith("chat.")) {
        if (pathname === "/" || (!pathname.startsWith("/app/") && !isFrameworkOrAssetPath(pathname))) {
          return Response.redirect(`https://chat.playjackpotjungle.com/app/chat${url.search}`, 302);
        }
        if (pathname.startsWith("/app/admin")) {
          return Response.redirect(`https://admin.playjackpotjungle.com${pathname}${url.search}`, 302);
        }
        if (pathname === "/vip" || pathname === "/rewards" || pathname === "/promotions" || pathname === "/leaderboard" || pathname === "/referrals" || pathname === "/support" || pathname === "/faq" || pathname === "/blog" || pathname === "/privacy" || pathname === "/terms" || pathname === "/download") {
          return Response.redirect(`https://playjackpotjungle.com${pathname}${url.search}`, 302);
        }
      } else if (host.startsWith("api.")) {
        if (pathname.startsWith("/app/admin")) {
          return Response.redirect(`https://admin.playjackpotjungle.com${pathname}${url.search}`, 302);
        } else if (pathname.startsWith("/app/")) {
          return Response.redirect(`https://chat.playjackpotjungle.com${pathname}${url.search}`, 302);
        }
      } else {
        // Primary domain (playjackpotjungle.com)
        if (pathname.startsWith("/app/admin")) {
          return Response.redirect(`https://admin.playjackpotjungle.com${pathname}${url.search}`, 302);
        }
        if (pathname.startsWith("/app/chat") || pathname.startsWith("/app/friends") || pathname.startsWith("/app/profile") || pathname.startsWith("/app/onboarding") || pathname.startsWith("/app/auth")) {
          return Response.redirect(`https://chat.playjackpotjungle.com${pathname}${url.search}`, 302);
        }
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
