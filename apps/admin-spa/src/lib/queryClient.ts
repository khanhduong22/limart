import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 1000, // 5s deduping window matching SWR behavior
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});
