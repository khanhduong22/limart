import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { fetcher } from "./api-client";
import { queryClient } from "./queryClient";

export interface AppQueryOptions<T = any>
  extends Omit<UseQueryOptions<T, any, T, readonly unknown[]>, "queryKey" | "queryFn"> {
  revalidateOnFocus?: boolean;
  revalidateIfStale?: boolean;
}

export function useAppQuery<T = any>(
  url: string | null | undefined,
  optionsOrFetcher?: any,
  maybeOptions?: any
) {
  const rawOptions: AppQueryOptions<T> =
    typeof optionsOrFetcher === "function"
      ? maybeOptions || {}
      : optionsOrFetcher || {};

  const {
    revalidateOnFocus,
    revalidateIfStale,
    enabled: optionEnabled,
    ...restOptions
  } = rawOptions;

  const isEnabled = Boolean(url) && (optionEnabled !== undefined ? optionEnabled : true);

  const query = useQuery<T, any, T>({
    queryKey: [url],
    queryFn: () => fetcher<T>(url!),
    enabled: isEnabled,
    ...(revalidateOnFocus !== undefined ? { refetchOnWindowFocus: revalidateOnFocus } : {}),
    ...restOptions,
  });

  return {
    data: query.data,
    error: query.error as any,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refetch: query.refetch,
    mutate: () => (url ? queryClient.invalidateQueries({ queryKey: [url] }) : Promise.resolve()),
  };
}

export { queryClient };
