import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CapyAssistant, { cleanAiMarkdown } from "./CapyAssistant";

describe("CapyAssistant: Text Formatting & JSON Cleaning", () => {
  it("safely extracts text if given a raw JSON string", () => {
    const rawJson = JSON.stringify({
      success: true,
      reply: "Chào bạn, đây là thông tin chấm công hợp lệ! 🦫",
    });

    const cleaned = cleanAiMarkdown(rawJson);
    expect(cleaned).toBe("Chào bạn, đây là thông tin chấm công hợp lệ! 🦫");
    expect(cleaned).not.toContain('{"success":true');
  });

  it("safely extracts content if JSON has content property", () => {
    const rawJson = JSON.stringify({
      success: true,
      content: "Nội dung hướng dẫn giải trình ca làm việc.",
    });

    const cleaned = cleanAiMarkdown(rawJson);
    expect(cleaned).toBe("Nội dung hướng dẫn giải trình ca làm việc.");
  });

  it("converts LaTeX math symbols into clean unicode characters", () => {
    const raw =
      "Nhân viên phải đăng ký ca làm $\\ge 4$ ca/tuần và số giờ $\\times 1.5$ khi tăng ca, không được $\\le 2$ ca.";
    const cleaned = cleanAiMarkdown(raw);

    expect(cleaned).toContain("≥ 4 ca/tuần");
    expect(cleaned).toContain("× 1.5");
    expect(cleaned).toContain("≤ 2 ca");
    expect(cleaned).not.toContain("$\\ge");
    expect(cleaned).not.toContain("\\times");
    expect(cleaned).not.toContain("\\le");
    expect(cleaned).not.toContain("$");
  });

  it("removes double dollar signs $$...$$ delimiters", () => {
    const raw = "Công thức tính: $$Lương = Giờ \\times ĐơnGiá$$";
    const cleaned = cleanAiMarkdown(raw);

    expect(cleaned).toBe("Công thức tính: Lương = Giờ × ĐơnGiá");
    expect(cleaned).not.toContain("$$");
  });
});

describe("CapyAssistant Component - Instant Local Knowledge Matching", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it("matches suggestion 'Quy trình xin giải trình?' instantly via click", async () => {
    render(<CapyAssistant currentUser={{ id: "user-1", name: "Nhân viên A" }} />);

    const suggestionBtn = screen.getByText(/Quy trình xin giải trình\?/i);
    fireEvent.click(suggestionBtn);

    await waitFor(
      () => {
        expect(screen.getByText(/chọn ngày cần giải trình/i)).toBeDefined();
        expect(screen.getByText(/24 giờ/i)).toBeDefined();
      },
      { timeout: 2000 }
    );
  });

  it("matches 'Quy trình xin giải trình' typed without question mark and extra spaces", async () => {
    render(<CapyAssistant currentUser={{ id: "user-1", name: "Nhân viên A" }} />);

    const input = screen.getByPlaceholderText("Hỏi Capy bất cứ điều gì...");
    fireEvent.change(input, { target: { value: "  quy trình xin giải trình  " } });

    fireEvent.submit(input.closest("form")!);

    await waitFor(
      () => {
        expect(screen.getByText(/chọn ngày cần giải trình/i)).toBeDefined();
        expect(screen.getByText(/\/requests/i)).toBeDefined();
        expect(screen.getByText(/24 giờ/i)).toBeDefined();
      },
      { timeout: 2000 }
    );
  });

  it("matches 'Cách đăng ký lịch làm việc' typed without question mark", async () => {
    render(<CapyAssistant currentUser={{ id: "user-1", name: "Nhân viên A" }} />);

    const input = screen.getByPlaceholderText("Hỏi Capy bất cứ điều gì...");
    fireEvent.change(input, { target: { value: "Cách đăng ký lịch làm việc" } });

    fireEvent.submit(input.closest("form")!);

    await waitFor(
      () => {
        expect(screen.getByText(/Ca Sáng: 8h30 - 12h/i)).toBeDefined();
        expect(screen.getByText(/Kèo thơm 🎁/i)).toBeDefined();
      },
      { timeout: 2000 }
    );
  });
});
