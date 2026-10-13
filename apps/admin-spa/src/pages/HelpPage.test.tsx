import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HelpPage } from "./HelpPage";
import { useAdminQuery } from "@/hooks/useAdminQuery";

vi.mock("@/hooks/useAdminQuery", () => ({
  useAdminQuery: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    delete: vi.fn(),
    post: vi.fn(),
    upload: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock lazy components for synchronous testing
vi.mock("@/components/help/MarkdownRenderer", () => ({
  default: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}));

vi.mock("@/components/help/UploadDocumentDialog", () => ({
  default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="upload-dialog">
        <span>Mock Upload Dialog</span>
        <button onClick={onClose}>Close Dialog</button>
      </div>
    ) : null,
}));

vi.mock("@/components/help/HelpChatTab", () => ({
  default: ({ docs }: { docs: any[] }) => (
    <div data-testid="help-chat-tab">
      <span>Mock Capy AI Chat ({docs.length} docs)</span>
    </div>
  ),
}));

const mockDocs = [
  {
    id: "doc-1",
    title: "Quy chế làm việc và chấm công",
    path: "quy-tac/cham-cong.md",
    content: "Chi tiết quy định chấm công LimArt 2026...",
  },
  {
    id: "doc-2",
    title: "Chính sách tiền lương nhân viên",
    path: "luong/chinh-sach-luong.md",
    content: "Bảng tính lương và thưởng hiệu quả...",
  },
];

describe("HelpPage Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAdminQuery).mockReturnValue({
      data: mockDocs,
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    } as any);
  });

  it("should render page header and documents list", async () => {
    render(<HelpPage />);

    expect(
      screen.getByText("Trợ lý Capy AI & Kho Tài Liệu Quy Chế")
    ).toBeDefined();
    expect(
      screen.getAllByText("Quy chế làm việc và chấm công").length
    ).toBeGreaterThan(0);
    expect(
      screen.getByText("Chính sách tiền lương nhân viên")
    ).toBeDefined();
  });

  it("should filter documents based on search query", async () => {
    render(<HelpPage />);

    const searchInput = screen.getByPlaceholderText(
      "Tìm kiếm tài liệu, quy chế, thưởng..."
    );
    fireEvent.change(searchInput, { target: { value: "tiền lương" } });

    expect(screen.queryByText("Quy chế làm việc và chấm công")).toBeNull();
    expect(
      screen.getAllByText("Chính sách tiền lương nhân viên").length
    ).toBeGreaterThan(0);
  });

  it("should open UploadDocumentDialog when clicking Tải tài liệu mới", async () => {
    render(<HelpPage />);

    const uploadBtn = screen.getByText("Tải tài liệu mới");
    fireEvent.click(uploadBtn);

    await waitFor(() => {
      expect(screen.getByTestId("upload-dialog")).toBeDefined();
    });

    const closeBtn = screen.getByText("Close Dialog");
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByTestId("upload-dialog")).toBeNull();
    });
  });

  it("should switch to Capy AI chat tab when selected", async () => {
    render(<HelpPage />);

    const chatTabBtn = screen.getByRole("tab", {
      name: /Trò chuyện cùng Capy AI/i,
    });
    fireEvent.keyDown(chatTabBtn, { key: "Enter" });
    fireEvent.keyDown(chatTabBtn, { key: " " });
    fireEvent.click(chatTabBtn);

    await waitFor(() => {
      expect(screen.getByTestId("help-chat-tab")).toBeDefined();
      expect(screen.getByText(/Mock Capy AI Chat \(2 docs\)/i)).toBeDefined();
    });
  });
});
