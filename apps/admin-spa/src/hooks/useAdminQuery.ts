import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { swrFetcher } from "@/lib/api";

export type QueryKeyInput = string | (string | number | undefined | null)[] | null | undefined;

export interface UseAdminQueryOptions<T> {
  fallbackData?: T;
  revalidateOnFocus?: boolean;
  refetchOnWindowFocus?: boolean;
  shouldRetryOnError?: boolean;
  retry?: boolean | number;
  dedupingInterval?: number;
  staleTime?: number;
  enabled?: boolean;
  onSuccess?: (data: T) => void;
  onError?: (error: any) => void;
}

export type FetcherFn<T> = (url: string) => Promise<T>;

export function useAdminQuery<T = any>(
  keyOrUrl: QueryKeyInput,
  fetcherOrOptions?: FetcherFn<T> | UseAdminQueryOptions<T>,
  maybeOptions?: UseAdminQueryOptions<T>
) {
  const queryClient = useQueryClient();

  let customFetcher: FetcherFn<T> | undefined;
  let options: UseAdminQueryOptions<T> | undefined;

  if (typeof fetcherOrOptions === "function") {
    customFetcher = fetcherOrOptions;
    options = maybeOptions;
  } else if (fetcherOrOptions && typeof fetcherOrOptions === "object") {
    options = fetcherOrOptions;
  }

  const isKeyValid = Boolean(keyOrUrl);
  const resolvedQueryKey: QueryKey = Array.isArray(keyOrUrl)
    ? (keyOrUrl as QueryKey)
    : [keyOrUrl ?? "__disabled__"];

  const url = typeof keyOrUrl === "string" ? keyOrUrl : "";

  // Handle refetchOnWindowFocus / revalidateOnFocus
  const refetchOnWindowFocus =
    options?.refetchOnWindowFocus ?? options?.revalidateOnFocus;

  // Handle retry / shouldRetryOnError
  let retry: boolean | number | undefined = options?.retry;
  if (options?.shouldRetryOnError !== undefined) {
    retry = options.shouldRetryOnError;
  }

  // Handle staleTime / dedupingInterval
  const staleTime = options?.staleTime ?? options?.dedupingInterval;

  const query = useQuery<T>({
    queryKey: resolvedQueryKey,
    queryFn: () => {
      if (customFetcher) {
        return customFetcher(url);
      }
      return swrFetcher<T>(url);
    },
    enabled: (options?.enabled ?? true) && isKeyValid,
    refetchOnWindowFocus,
    retry,
    staleTime,
    initialData: options?.fallbackData,
  });

  // TanStack Query v5 removed onSuccess/onError options on useQuery; handle via effects
  const onSuccessRef = useRef(options?.onSuccess);
  onSuccessRef.current = options?.onSuccess;
  const onErrorRef = useRef(options?.onError);
  onErrorRef.current = options?.onError;

  const prevDataRef = useRef<T | undefined>(undefined);
  useEffect(() => {
    if (query.isSuccess && query.data !== undefined && query.data !== prevDataRef.current) {
      prevDataRef.current = query.data;
      onSuccessRef.current?.(query.data);
    }
  }, [query.isSuccess, query.data]);

  useEffect(() => {
    if (query.isError && query.error) {
      onErrorRef.current?.(query.error);
    }
  }, [query.isError, query.error]);

  const mutate = useCallback(
    async (newDataOrUpdater?: any, shouldRevalidate: boolean = true) => {
      if (newDataOrUpdater !== undefined) {
        queryClient.setQueryData(resolvedQueryKey, (old: any) => {
          if (typeof newDataOrUpdater === "function") {
            return newDataOrUpdater(old);
          }
          return newDataOrUpdater;
        });
      }
      if (shouldRevalidate !== false || newDataOrUpdater === undefined) {
        await queryClient.invalidateQueries({ queryKey: resolvedQueryKey });
      }
    },
    [queryClient, resolvedQueryKey]
  );

  return {
    data: query.data,
    error: query.error,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isValidating: query.isFetching,
    isSuccess: query.isSuccess,
    isError: query.isError,
    mutate,
    refetch: query.refetch,
  };
}
