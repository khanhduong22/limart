import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HelpChatTab } from "./HelpChatTab";
import { api } from "@/lib/api";
import { DocumentItem } from "./types";

vi.mock("@/lib/api", () => ({
  api: {
    post: vi.fn(),
  },
}));

// Mock MarkdownRenderer for synchronous test execution
vi.mock("@/components/help/MarkdownRenderer", () => ({
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));

const mockDocs: DocumentItem[] = [
  {
    id: "doc-1",
    title: "Quy chế chuyên cần và thưởng nóng",
    path: "quy-tac/chuyen-can.md",
    content: "Nội dung quy định thưởng nóng chuyên cần 200k...",
  },
  {
    id: "doc-2",
    title: "Chính sách đi muộn về sớm",
    path: "quy-tac/di-muon.md",
    content: "Quy định phạt đi muộn ân hạn 1 phút...",
  },
];

describe("HelpChatTab Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render initial greeting message and suggestion prompts", async () => {
    render(
      <HelpChatTab
        docs={mockDocs}
        selectedDoc={mockDocs[0]}
        onSelectDoc={vi.fn()}
      />
    );

    expect(screen.getByText("Gợi ý câu hỏi")).toBeDefined();
    expect(
      screen.getByText(/Quy định phạt đi muộn như thế nào\?/i)
    ).toBeDefined();

    await waitFor(() => {
      expect(
        screen.getByText(/Xin chào Quản lý! Em là Capy AI/i)
      ).toBeDefined();
    });
  });

  it("should send a query and display assistant reply when api.post resolves", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      reply: "Chào anh/chị, đây là câu trả lời giải đáp từ Capy AI!",
    });

    render(
      <HelpChatTab
        docs={mockDocs}
        selectedDoc={mockDocs[0]}
        onSelectDoc={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText(
      "Hỏi Capy AI về quy chế, thưởng nóng, tính công, kỷ luật..."
    );
    fireEvent.change(input, { target: { value: "Hỏi về cách tính thưởng" } });

    const sendBtn = screen.getByText("Gửi");
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/api/documents/chat",
        expect.objectContaining({
          query: "Hỏi về cách tính thưởng",
        })
      );
      expect(
        screen.getByText("Chào anh/chị, đây là câu trả lời giải đáp từ Capy AI!")
      ).toBeDefined();
    });
  });

  it("should use fallback matching when api.post fails", async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error("Network Error"));

    render(
      <HelpChatTab
        docs={mockDocs}
        selectedDoc={mockDocs[0]}
        onSelectDoc={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText(
      "Hỏi Capy AI về quy chế, thưởng nóng, tính công, kỷ luật..."
    );
    fireEvent.change(input, { target: { value: "Quy định đi muộn" } });

    const sendBtn = screen.getByText("Gửi");
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByText(/Quy chế đi muộn:/i)).toBeDefined();
    });
  });

  it("should trigger send when clicking a preset prompt button", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      reply: "Điều kiện nhận thưởng chuyên cần 200k là...",
    });

    render(
      <HelpChatTab
        docs={mockDocs}
        selectedDoc={mockDocs[0]}
        onSelectDoc={vi.fn()}
      />
    );

    const presetBtn = screen.getByText(/Điều kiện nhận thưởng chuyên cần 200k\?/i);
    fireEvent.click(presetBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/api/documents/chat",
        expect.objectContaining({
          query: "Điều kiện nhận thưởng chuyên cần 200k?",
        })
      );
    });
  });
});
