import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UploadDocumentDialog } from "./UploadDocumentDialog";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: {
    upload: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("UploadDocumentDialog Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render dialog content when isOpen is true", () => {
    render(
      <UploadDocumentDialog
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(screen.getByText("Tải lên tài liệu quy chế mới")).toBeDefined();
    expect(
      screen.getByPlaceholderText("Ví dụ: Quy chế thưởng nóng đóng hàng 2026...")
    ).toBeDefined();
    expect(screen.getByText("Lưu tài liệu")).toBeDefined();
  });

  it("should call onClose when Hủy button is clicked", () => {
    const handleClose = vi.fn();
    render(
      <UploadDocumentDialog
        isOpen={true}
        onClose={handleClose}
        onSuccess={vi.fn()}
      />
    );

    const cancelButton = screen.getByText("Hủy");
    fireEvent.click(cancelButton);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("should submit document and call onSuccess and onClose", async () => {
    vi.mocked(api.upload).mockResolvedValueOnce({
      success: true,
      data: { id: "doc-1" },
    });

    const handleClose = vi.fn();
    const handleSuccess = vi.fn();

    render(
      <UploadDocumentDialog
        isOpen={true}
        onClose={handleClose}
        onSuccess={handleSuccess}
      />
    );

    const titleInput = screen.getByPlaceholderText(
      "Ví dụ: Quy chế thưởng nóng đóng hàng 2026..."
    );
    fireEvent.change(titleInput, { target: { value: "Quy chế làm việc mới" } });

    const file = new File(["test document content"], "test-doc.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, "files", {
      value: [file],
    });
    fireEvent.change(fileInput);

    const form = fileInput.closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(api.upload).toHaveBeenCalledWith(
        "/api/documents",
        expect.any(FormData)
      );
      expect(handleSuccess).toHaveBeenCalledTimes(1);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });
});
