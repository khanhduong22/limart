import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CreateRequestModal from "./CreateRequestModal";
import * as apiClient from "@/lib/api-client";
import { toast } from "sonner";

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock api-client
vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    submitRequest: vi.fn(),
  };
});

describe("CreateRequestModal Component", () => {
  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <CreateRequestModal isOpen={false} onClose={mockOnClose} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders form fields correctly when isOpen is true", () => {
    render(
      <CreateRequestModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    expect(screen.getByText("Gửi yêu cầu / giải trình")).toBeDefined();
    expect(screen.getByLabelText("Ngày áp dụng")).toBeDefined();
    expect(screen.getByLabelText("Loại yêu cầu")).toBeDefined();
    expect(screen.getByLabelText("Lý do cụ thể")).toBeDefined();
    expect(screen.getByRole("button", { name: "Hủy" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Gửi yêu cầu" })).toBeDefined();
  });

  it("shows error toast when submitting empty reason", async () => {
    render(
      <CreateRequestModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const reasonInput = screen.getByLabelText("Lý do cụ thể");
    fireEvent.change(reasonInput, { target: { value: "   " } });

    const submitBtn = screen.getByRole("button", { name: "Gửi yêu cầu" });
    fireEvent.click(submitBtn);

    expect(toast.error).toHaveBeenCalledWith("Vui lòng nhập lý do giải trình");
    expect(apiClient.submitRequest).not.toHaveBeenCalled();
  });

  it("submits request successfully and invokes callbacks", async () => {
    vi.mocked(apiClient.submitRequest).mockResolvedValue({
      success: true,
      message: "Success",
    });

    render(
      <CreateRequestModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const dateInput = screen.getByLabelText("Ngày áp dụng");
    fireEvent.change(dateInput, { target: { value: "2026-10-15" } });

    const typeSelect = screen.getByLabelText("Loại yêu cầu");
    fireEvent.change(typeSelect, { target: { value: "WFH" } });

    const reasonInput = screen.getByLabelText("Lý do cụ thể");
    fireEvent.change(reasonInput, {
      target: { value: "Bận việc gia đình, xin WFH" },
    });

    const submitBtn = screen.getByRole("button", { name: "Gửi yêu cầu" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiClient.submitRequest).toHaveBeenCalledWith(
        "2026-10-15",
        "WFH",
        "Bận việc gia đình, xin WFH"
      );
      expect(toast.success).toHaveBeenCalledWith("✅ Đã gửi yêu cầu thành công!");
      expect(mockOnClose).toHaveBeenCalled();
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });

  it("handles submission failure with error toast", async () => {
    vi.mocked(apiClient.submitRequest).mockResolvedValue({
      success: false,
      message: "Ngày này đã có đơn giải trình",
    });

    render(
      <CreateRequestModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const reasonInput = screen.getByLabelText("Lý do cụ thể");
    fireEvent.change(reasonInput, { target: { value: "Lý do kiểm thử lỗi" } });

    const submitBtn = screen.getByRole("button", { name: "Gửi yêu cầu" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Ngày này đã có đơn giải trình");
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  it("calls onClose when clicking Hủy button", () => {
    render(
      <CreateRequestModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const cancelBtn = screen.getByRole("button", { name: "Hủy" });
    fireEvent.click(cancelBtn);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
