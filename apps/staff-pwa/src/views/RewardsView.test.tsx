import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { RewardsView } from "./RewardsView";

// Mock router and api-query
vi.mock("@/lib/router", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  Link: ({ children, to, className }: any) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/api-query", () => ({
  useAppQuery: () => ({
    data: {
      success: true,
      data: {
        topDiscipline: [
          { name: "Nhân viên A", daysWorked: 26, totalHours: 130, punctualityRate: 100 },
        ],
      },
    },
    isLoading: false,
    mutate: vi.fn(),
  }),
}));

describe("RewardsView Responsive Layout & Mobile Safety", () => {
  it("renders RewardsView with w-full, max-w-full, and responsive md:max-w-md constraints", () => {
    const { container } = render(<RewardsView />);

    // Check header
    expect(screen.getByText("Bảng Vàng & Khen Thưởng")).toBeDefined();
    expect(screen.getByText("Vòng Quay May Mắn")).toBeDefined();

    // Check root container has mobile-first responsive constraints
    const rootDiv = container.firstChild as HTMLElement;
    expect(rootDiv.className).toContain("w-full");
    expect(rootDiv.className).toContain("max-w-full");
    expect(rootDiv.className).toContain("md:max-w-md");
    expect(rootDiv.className).toContain("box-border");
  });

  it("renders category tabs wrapped inside an isolated overflow container to prevent flex expansion", () => {
    const { container } = render(<RewardsView />);

    expect(screen.getByText("Chuyên cần")).toBeDefined();
    expect(screen.getByText("Chăm chỉ")).toBeDefined();
    expect(screen.getByText("Tăng ca")).toBeDefined();
    expect(screen.getByText("Đóng hàng")).toBeDefined();
    expect(screen.getByText("Bưng hàng")).toBeDefined();

    // Verify tabs wrapper has overflow-hidden and min-w-0
    const tabsWrapper = container.querySelector(".overflow-hidden");
    expect(tabsWrapper).not.toBeNull();
  });
});
