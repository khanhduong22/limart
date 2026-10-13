import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AnnouncementBar, { clearSessionDismissedAnnouncements } from "./AnnouncementBar";
import * as apiClient from "@/lib/api-client";

// Storage Mock
const storageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: storageMock,
  writable: true,
  configurable: true,
});

if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    value: storageMock,
    writable: true,
    configurable: true,
  });
}

describe("AnnouncementBar Component", () => {
  beforeEach(() => {
    storageMock.clear();
    clearSessionDismissedAnnouncements();
    vi.restoreAllMocks();
  });

  const sampleAnnouncements: apiClient.AnnouncementItem[] = [
    {
      id: "ann_1",
      title: "Thông báo bảo trì hệ thống",
      content: "Hệ thống sẽ bảo trì từ 23:00 đến 01:00.",
      type: "WARNING",
      active: true,
      createdAt: "2026-10-13T08:00:00.000Z",
      isRead: false,
    },
    {
      id: "ann_2",
      title: "Chào mừng nhân viên mới",
      content: "Chào mừng bạn gia nhập đội ngũ LimArt!",
      type: "INFO",
      active: true,
      createdAt: "2026-10-13T09:00:00.000Z",
      isRead: false,
    },
  ];

  it("renders null when announcements array is empty", () => {
    const { container } = render(<AnnouncementBar announcements={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders modal with unread announcements", () => {
    render(<AnnouncementBar announcements={sampleAnnouncements} />);
    expect(screen.getByText("THÔNG BÁO MỚI NHẤT")).toBeDefined();
    expect(screen.getByText("Bạn có 2 thông báo mới")).toBeDefined();
    expect(screen.getByText("Thông báo bảo trì hệ thống")).toBeDefined();
    expect(screen.getByText("Chào mừng nhân viên mới")).toBeDefined();
  });

  it("filters out announcements marked read in localStorage", () => {
    storageMock.setItem("read_announcement_ids", JSON.stringify(["ann_1"]));

    render(<AnnouncementBar announcements={sampleAnnouncements} />);
    expect(screen.getByText("Bạn có 1 thông báo mới")).toBeDefined();
    expect(screen.queryByText("Thông báo bảo trì hệ thống")).toBeNull();
    expect(screen.getByText("Chào mừng nhân viên mới")).toBeDefined();
  });

  it("handles corrupted JSON in read_announcement_ids safely", () => {
    storageMock.setItem("read_announcement_ids", "CORRUPTED_JSON_NOT_AN_ARRAY");

    render(<AnnouncementBar announcements={sampleAnnouncements} />);
    expect(screen.getByText("Bạn có 2 thông báo mới")).toBeDefined();
  });

  it("marks announcements as read, updates localStorage, and hides popup on confirm", async () => {
    const markSpy = vi.spyOn(apiClient, "markAnnouncementsAsRead").mockResolvedValue(true);
    const onMarkedRead = vi.fn();

    const { container } = render(
      <AnnouncementBar
        announcements={sampleAnnouncements}
        onMarkedRead={onMarkedRead}
      />
    );

    const confirmBtn = screen.getByText("Xác nhận đã đọc");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(markSpy).toHaveBeenCalledWith(["ann_1", "ann_2"]);
      expect(onMarkedRead).toHaveBeenCalled();
    });

    const savedIds = JSON.parse(storageMock.getItem("read_announcement_ids") || "[]");
    expect(savedIds).toContain("ann_1");
    expect(savedIds).toContain("ann_2");
    expect(container.firstChild).toBeNull();
  });

  it("dismisses popup and remembers in session when close button is clicked", async () => {
    vi.spyOn(apiClient, "markAnnouncementsAsRead").mockResolvedValue(true);

    const { container, rerender } = render(
      <AnnouncementBar announcements={sampleAnnouncements} />
    );

    const closeBtn = screen.getByTitle("Đóng thông báo");
    fireEvent.click(closeBtn);

    expect(container.firstChild).toBeNull();

    // Rerendering with same announcements should remain dismissed (memoized / session cache)
    rerender(<AnnouncementBar announcements={sampleAnnouncements} />);
    expect(container.firstChild).toBeNull();
  });
});
