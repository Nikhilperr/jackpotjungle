import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/** Dark underlay only — never a second logo/loading flash after native splash. */
function DefaultPending() {
  return <div className="min-h-[100dvh] w-full bg-[#121212]" aria-hidden="true" />;
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
