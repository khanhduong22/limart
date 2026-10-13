import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAdminQuery } from "./useAdminQuery";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useAdminQuery Hook", () => {
  it("fetches immediately on mount without delay even when fallbackData is provided", async () => {
    const fetcherMock = vi.fn().mockResolvedValue({ count: 42 });
    const fallback = { count: 0 };

    const { result } = renderHook(
      () =>
        useAdminQuery("/api/test-stats", fetcherMock, {
          fallbackData: fallback,
          dedupingInterval: 5000,
        }),
      { wrapper: createWrapper() }
    );

    // Fetcher must be called immediately on mount (not delayed by dedupingInterval)
    expect(fetcherMock).toHaveBeenCalledTimes(1);

    // Initial placeholder should be fallback
    expect(result.current.data).toEqual({ count: 0 });

    // When fetcher completes, data updates to real server response
    await waitFor(() => {
      expect(result.current.data).toEqual({ count: 42 });
    });
  });

  it("does not call onSuccess on placeholder data", async () => {
    const fetcherMock = vi.fn().mockResolvedValue({ id: 123 });
    const onSuccess = vi.fn();

    const { result } = renderHook(
      () =>
        useAdminQuery("/api/test-item", fetcherMock, {
          fallbackData: { id: 0 },
          onSuccess,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.data).toEqual({ id: 123 });
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith({ id: 123 });
  });

  it("triggers refetch on mutate()", async () => {
    let callCount = 0;
    const fetcherMock = vi.fn().mockImplementation(async () => {
      callCount++;
      return { val: callCount };
    });

    const { result } = renderHook(
      () => useAdminQuery("/api/test-mutate", fetcherMock),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.data).toEqual({ val: 1 });
    });

    await result.current.mutate();

    await waitFor(() => {
      expect(result.current.data).toEqual({ val: 2 });
    });
  });
});
