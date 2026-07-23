import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/** Theme-matched underlay — never a second logo/loading flash after native splash. */
function DefaultPending() {
  return (
    <div
      className="h-full w-full bg-background"
      style={{ minHeight: "var(--jj-app-height, 100%)" }}
      aria-hidden="true"
    />
  );
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        staleTime: 30000,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 15000,
    defaultPendingComponent: DefaultPending,
    defaultPendingMs: 0,
  });

  return router;
};
