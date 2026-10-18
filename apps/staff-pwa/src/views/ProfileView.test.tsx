import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProfileView } from "./ProfileView";
import { StaffProfile } from "@/lib/api-client";

const mockPush = vi.fn();
vi.mock("@/lib/router", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/components/pwa", () => ({
  triggerPwaInstallPrompt: vi.fn(),
}));

describe("ProfileView Avatar & Performance Audit", () => {
  const mockProfile: StaffProfile = {
    id: "staff-1",
    name: "Nguyễn Văn A",
    email: "nguyenvana@gmail.com",
    role: "STAFF",
    employmentType: "FULL_TIME",
    hourlyRate: 25000,
    avatarUrl: "https://lh3.googleusercontent.com/a/ACg8ocI-sample-avatar",
    streakDays: 5,
    gachaTickets: 3,
    achievements: [],
  };

  it("renders Google profile avatar with lazy loading and async decoding", () => {
    render(<ProfileView profile={mockProfile} />);

    const img = screen.getByRole("img", { name: "Nguyễn Văn A" });
    expect(img).toBeDefined();
    expect(img.getAttribute("src")).toBe("https://lh3.googleusercontent.com/a/ACg8ocI-sample-avatar");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("decoding")).toBe("async");
    expect(img.getAttribute("width")).toBe("80");
    expect(img.getAttribute("height")).toBe("80");
  });

  it("falls back to default capybara mascot when image fails to load via onError", () => {
    render(<ProfileView profile={mockProfile} />);

    const img = screen.getByRole("img", { name: "Nguyễn Văn A" }) as HTMLImageElement;
    fireEvent.error(img);

    expect(img.src).toContain("/capybara_mascot.webp");
  });

  it("uses default mascot when avatarUrl is missing", () => {
    const profileWithoutAvatar = {
      ...mockProfile,
      avatarUrl: "",
    };

    render(<ProfileView profile={profileWithoutAvatar} />);

    const img = screen.getByRole("img", { name: "Nguyễn Văn A" });
    expect(img.getAttribute("src")).toBe("/capybara_mascot.webp");
  });

  it("renders NotificationOptInCard with shift reminder settings in Profile tab", async () => {
    render(<ProfileView profile={mockProfile} />);

    await waitFor(() => {
      expect(screen.getByText("Thông Báo Nhắc Ca Tự Động")).toBeDefined();
    });
  });

  it("renders and navigates to Lịch sử chấm công (/history) and Vòng quay nhân phẩm (/lucky-wheel)", () => {
    render(<ProfileView profile={mockProfile} />);

    const historyBtn = screen.getByText("Lịch sử chấm công");
    expect(historyBtn).toBeDefined();
    fireEvent.click(historyBtn);
    expect(mockPush).toHaveBeenCalledWith("/history");

    const luckyWheelBtn = screen.getByText("Vòng quay nhân phẩm");
    expect(luckyWheelBtn).toBeDefined();
    fireEvent.click(luckyWheelBtn);
    expect(mockPush).toHaveBeenCalledWith("/lucky-wheel");
  });
});
