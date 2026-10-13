import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuditLogPage } from "./AuditLogPage";
import * as apiModule from "@/lib/api";

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe("AuditLogPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders page header, filters, and requests page 1 with limit 25 by default", async () => {
    const swrFetcherSpy = vi.spyOn(apiModule, "swrFetcher").mockResolvedValue({
      success: true,
      total: 50,
      page: 1,
      limit: 25,
      totalPages: 2,
      logs: [
        {
          id: "log-1",
          userId: "u-1",
          user: {
            id: "u-1",
            name: "Nguyễn Văn A",
            email: "vana@gmail.com",
            image: null,
            role: "STAFF",
          },
          action: "LOGIN",
          status: "SUCCESS",
          ipAddress: "192.168.1.100",
          userAgent: "Mozilla/5.0",
          device: "Desktop",
          createdAt: new Date().toISOString(),
        },
      ],
    });

    renderWithClient(<AuditLogPage />);

    expect(
      screen.getByText("Nhật Ký Phiên & Giám Sát Truy Cập")
    ).toBeDefined();

    await waitFor(() => {
      expect(swrFetcherSpy).toHaveBeenCalledWith(
        "/api/auth/audit-logs?page=1&limit=25&action=ALL&status=ALL&search="
      );
    });

    expect(await screen.findByText("Nguyễn Văn A")).toBeDefined();
    expect(screen.getByText("vana@gmail.com")).toBeDefined();
    expect(screen.getByText("192.168.1.100")).toBeDefined();
    expect(screen.getByText(/Tổng 50 sự kiện/)).toBeDefined();
  });

  it("navigates to next page and updates query parameters", async () => {
    const swrFetcherSpy = vi.spyOn(apiModule, "swrFetcher").mockResolvedValue({
      success: true,
      total: 50,
      page: 1,
      limit: 25,
      totalPages: 2,
      logs: [
        {
          id: "log-1",
          action: "LOGIN",
          status: "SUCCESS",
          createdAt: new Date().toISOString(),
        },
      ],
    });

    renderWithClient(<AuditLogPage />);

    await waitFor(() => {
      expect(swrFetcherSpy).toHaveBeenCalledWith(
        "/api/auth/audit-logs?page=1&limit=25&action=ALL&status=ALL&search="
      );
    });

    const nextBtn = screen.getByRole("button", { name: "Trang sau" });

    // Wait until data finishes loading and next button is enabled
    await waitFor(() => {
      expect((nextBtn as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(swrFetcherSpy).toHaveBeenCalledWith(
        "/api/auth/audit-logs?page=2&limit=25&action=ALL&status=ALL&search="
      );
    });
  });

  it("changes page size and resets page index to 0", async () => {
    const swrFetcherSpy = vi.spyOn(apiModule, "swrFetcher").mockResolvedValue({
      success: true,
      total: 100,
      page: 1,
      limit: 25,
      totalPages: 4,
      logs: [],
    });

    renderWithClient(<AuditLogPage />);

    await waitFor(() => {
      expect(swrFetcherSpy).toHaveBeenCalledWith(
        "/api/auth/audit-logs?page=1&limit=25&action=ALL&status=ALL&search="
      );
    });

    const pageSizeSelect = screen.getByLabelText("Số dòng mỗi trang");
    fireEvent.change(pageSizeSelect, { target: { value: "50" } });

    await waitFor(() => {
      expect(swrFetcherSpy).toHaveBeenCalledWith(
        "/api/auth/audit-logs?page=1&limit=50&action=ALL&status=ALL&search="
      );
    });
  });

  it("jumps to a specific page via page jump input", async () => {
    const swrFetcherSpy = vi.spyOn(apiModule, "swrFetcher").mockResolvedValue({
      success: true,
      total: 100,
      page: 1,
      limit: 25,
      totalPages: 4,
      logs: [],
    });

    renderWithClient(<AuditLogPage />);

    await waitFor(() => {
      expect(swrFetcherSpy).toHaveBeenCalledWith(
        "/api/auth/audit-logs?page=1&limit=25&action=ALL&status=ALL&search="
      );
    });

    const jumpInput = screen.getByLabelText("Nhập số trang");
    fireEvent.change(jumpInput, { target: { value: "3" } });
    const jumpBtn = screen.getByRole("button", { name: "Nhảy" });
    fireEvent.click(jumpBtn);

    await waitFor(() => {
      expect(swrFetcherSpy).toHaveBeenCalledWith(
        "/api/auth/audit-logs?page=3&limit=25&action=ALL&status=ALL&search="
      );
    });
  });

  it("filters by action and status", async () => {
    const swrFetcherSpy = vi.spyOn(apiModule, "swrFetcher").mockResolvedValue({
      success: true,
      total: 10,
      page: 1,
      limit: 25,
      totalPages: 1,
      logs: [],
    });

    renderWithClient(<AuditLogPage />);

    await waitFor(() => {
      expect(swrFetcherSpy).toHaveBeenCalledWith(
        "/api/auth/audit-logs?page=1&limit=25&action=ALL&status=ALL&search="
      );
    });

    const actionSelect = screen.getByLabelText("Lọc theo hành động");
    fireEvent.change(actionSelect, { target: { value: "LOGIN" } });

    await waitFor(() => {
      expect(swrFetcherSpy).toHaveBeenCalledWith(
        "/api/auth/audit-logs?page=1&limit=25&action=LOGIN&status=ALL&search="
      );
    });

    const statusSelect = screen.getByLabelText("Lọc theo trạng thái");
    fireEvent.change(statusSelect, { target: { value: "FAILED" } });

    await waitFor(() => {
      expect(swrFetcherSpy).toHaveBeenCalledWith(
        "/api/auth/audit-logs?page=1&limit=25&action=LOGIN&status=FAILED&search="
      );
    });
  });

  it("filters by search term", async () => {
    const swrFetcherSpy = vi.spyOn(apiModule, "swrFetcher").mockResolvedValue({
      success: true,
      total: 5,
      page: 1,
      limit: 25,
      totalPages: 1,
      logs: [],
    });

    renderWithClient(<AuditLogPage />);

    await waitFor(() => {
      expect(swrFetcherSpy).toHaveBeenCalledWith(
        "/api/auth/audit-logs?page=1&limit=25&action=ALL&status=ALL&search="
      );
    });

    const searchInput = screen.getByPlaceholderText("Tìm theo tên, email, IP...");
    fireEvent.change(searchInput, { target: { value: "192.168" } });

    await waitFor(() => {
      expect(swrFetcherSpy).toHaveBeenCalledWith(
        "/api/auth/audit-logs?page=1&limit=25&action=ALL&status=ALL&search=192.168"
      );
    });
  });
});
