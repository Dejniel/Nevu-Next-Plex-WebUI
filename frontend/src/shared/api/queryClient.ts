import { QueryClient } from "@tanstack/react-query";

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 30_000,
        gcTime: 300_000,
        networkMode: "always",
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        structuralSharing: true,
      },
    },
  });

export const serverQueryClient = createQueryClient();
