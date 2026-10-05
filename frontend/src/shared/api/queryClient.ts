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

// Library windows and metadata use Query's lifecycle. Lists and availability
// still supply their refresh cadence until their stage 3 migration.
export const serverQueryClient = createQueryClient();
