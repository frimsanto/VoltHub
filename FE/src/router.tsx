import { QueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/**
 * Global React Query defaults — stability over chattiness.
 *
 * The previous bare `new QueryClient()` used the library defaults: retry every
 * failed query 3× AND refetch on every window focus. Combined with the
 * dashboard's request fan-out, a single rate-limit (429) snowballed into a
 * request storm (each query retrying + refetching on focus). These defaults
 * stop that at the source:
 *  - never retry client errors (401/403/404/422/429) — retrying can't fix them
 *    and only amplifies load; retry network/5xx a bounded 2×.
 *  - no refetch on window focus (alt-tabbing shouldn't re-hit the whole API).
 *  - a 30s staleTime so quick back-and-forth navigation reuses the cache.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        const status = (error as AxiosError)?.response?.status;
        if (status && status >= 400 && status < 500) return false; // 4xx incl. 429
        return failureCount < 2; // network / 5xx → at most 2 retries
      },
    },
    mutations: { retry: false },
  },
});

export const router = createRouter({
  routeTree,
  context: { queryClient },
  scrollRestoration: true,
  defaultPreloadStaleTime: 0,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export const getRouter = () => router;
