import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreateAnnouncementDialog } from "./CreateAnnouncementDialog";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: {
    post: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("CreateAnnouncementDialog Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render null when open is false", () => {
    const { container } = render(
      <CreateAnnouncementDialog open={false} onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("should render modal form when open is true", () => {
    render(<CreateAnnouncementDialog open={true} onClose={vi.fn()} />);

    expect(screen.getByText("Đăng Thông Báo Mới")).toBeDefined();
    expect(screen.getByPlaceholderText("VD: Thông báo nghỉ lễ...")).toBeDefined();
    expect(screen.getByPlaceholderText("Nội dung chi tiết...")).toBeDefined();
    expect(screen.getByText("Đăng ngay")).toBeDefined();
  });

  it("should call onClose when Hủy button is clicked", () => {
    const handleClose = vi.fn();
    render(<CreateAnnouncementDialog open={true} onClose={handleClose} />);

    const cancelButton = screen.getByText("Hủy");
    fireEvent.click(cancelButton);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("should submit form and call onCreated when submitted", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ success: true });
    const handleClose = vi.fn();
    const handleCreated = vi.fn();

    render(
      <CreateAnnouncementDialog
        open={true}
        onClose={handleClose}
        onCreated={handleCreated}
      />
    );

    const titleInput = screen.getByPlaceholderText("VD: Thông báo nghỉ lễ...");
    const contentInput = screen.getByPlaceholderText("Nội dung chi tiết...");

    fireEvent.change(titleInput, { target: { value: "Thông báo test" } });
    fireEvent.change(contentInput, { target: { value: "Nội dung test" } });

    const submitBtn = screen.getByText("Đăng ngay");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/api/admin/announcements", {
        title: "Thông báo test",
        content: "Nội dung test",
        type: "INFO",
      });
      expect(handleCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Thông báo test",
          content: "Nội dung test",
          type: "INFO",
        })
      );
      expect(handleClose).toHaveBeenCalled();
    });
  });
});
