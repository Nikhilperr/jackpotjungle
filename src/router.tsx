import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

function DefaultPending() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false, // Prevent background refetches from triggering on window/app focus
        staleTime: 30000,            // Consider cached query data fresh for 30s
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 15000, // Preloaded data is fresh for 15s
    defaultPendingComponent: DefaultPending,
    defaultPendingMs: 300,          // Only display full-screen loading spinner if page load exceeds 300ms
  });

  return router;
};
