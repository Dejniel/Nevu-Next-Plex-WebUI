import { QueryClient } from "@tanstack/react-query";

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 30_000,
        gcTime: 300_000,
        networkMode: "always",
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        structuralSharing: false,
      },
    },
  });

// Browser refresh cadence belongs to RefreshScheduler; request state belongs here.
export const serverQueryClient = createQueryClient();
