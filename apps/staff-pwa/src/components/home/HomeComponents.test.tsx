import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  CheckinHeaderCard,
  CheckinTimerCard,
  LocationSecurityBanner,
  QuickTaskSummaryWidget,
  LateWarningBanner,
} from "./index";

describe("Home Modular Components", () => {
  describe("CheckinHeaderCard", () => {
    it("renders user greeting, streak, and shift badge", () => {
      render(
        <CheckinHeaderCard
          user={{
            id: "u1",
            name: "Nguyễn Văn A",
            role: "USER",
            email: "a@limart.vn",
          }}
          streak={5}
          swapCount={1}
          todayShift={{
            id: 1,
            start: "2026-10-12T08:30:00.000Z",
            end: "2026-10-12T17:30:00.000Z",
          }}
          todayCheckins={[]}
        />
      );

      expect(screen.getByText("Chấm Công")).toBeDefined();
      expect(screen.getByText("Nguyễn Văn A")).toBeDefined();
      expect(screen.getByText("🔥 5")).toBeDefined();
      expect(screen.getByText("🎁 1 kèo thơm")).toBeDefined();
    });

    it("renders working badge when currently checked in", () => {
      render(
        <CheckinHeaderCard
          user={{ id: "u1", name: "Nguyễn Văn A", role: "USER", email: "a@limart.vn" }}
          todayCheckins={[{ id: "c1", type: "checkin", timestamp: new Date().toISOString() }]}
        />
      );

      expect(screen.getByText("🟢 Đang làm việc")).toBeDefined();
    });
  });

  describe("CheckinTimerCard", () => {
    it("renders live timer when user has active check-in", () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      render(
        <CheckinTimerCard
          todayCheckins={[{ id: "c1", type: "checkin", timestamp: tenMinutesAgo }]}
          todayShift={{ id: 1, end: new Date(Date.now() + 60 * 60 * 1000).toISOString() }}
        />
      );

      expect(screen.getByText("Thời gian làm việc ca này")).toBeDefined();
      expect(screen.getByText("Vào ca lúc:")).toBeDefined();
      expect(screen.getByText("Dự kiến tan:")).toBeDefined();
    });

    it("renders nothing when user has not checked in yet", () => {
      const { container } = render(
        <CheckinTimerCard todayCheckins={[]} />
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe("LocationSecurityBanner", () => {
    it("renders allowed badge when connected to store wifi", () => {
      render(
        <LocationSecurityBanner
          ipStatus={{
            isAllowed: true,
            locationName: "LimArt Store (Văn phòng chính)",
            ip: "127.0.0.1",
          }}
        />
      );

      expect(screen.getByText("LimArt Store (Văn phòng chính)")).toBeDefined();
    });

    it("renders warning banner when outside store wifi", () => {
      render(
        <LocationSecurityBanner
          ipStatus={{
            isAllowed: false,
            locationName: "Mạng ngoài",
            ip: "14.162.12.34",
          }}
        />
      );

      expect(screen.getByText("Chưa kết nối Wi-Fi cửa hàng LimArt")).toBeDefined();
      expect(screen.getByText(/IP hiện tại: 14.162.12.34/)).toBeDefined();
    });
  });

  describe("QuickTaskSummaryWidget", () => {
    it("renders shift duties progress and triggers click handler", () => {
      const onOpen = vi.fn();
      render(
        <QuickTaskSummaryWidget
          todayDuties={[
            { id: "d1", title: "Lau sàn", isCompleted: true },
            { id: "d2", title: "Bật đèn", isCompleted: false },
          ]}
          onOpenDuties={onOpen}
        />
      );

      expect(screen.getByText("Nhiệm vụ ca làm hôm nay")).toBeDefined();
      expect(screen.getByText("1/2 xong")).toBeDefined();
      expect(screen.getByText("50%")).toBeDefined();

      fireEvent.click(screen.getByText("Nhiệm vụ ca làm hôm nay"));
      expect(onOpen).toHaveBeenCalled();
    });
  });

  describe("LateWarningBanner", () => {
    it("renders late warning when lateCount >= 2", () => {
      render(
        <LateWarningBanner
          lateCount={4}
          latePenaltyHours={1}
          latePenaltyAmount={25000}
        />
      );

      expect(screen.getByText("⛔ Bị trừ lương do đi trễ")).toBeDefined();
      expect(screen.getByText("1 giờ")).toBeDefined();
    });

    it("renders null when lateCount < 2", () => {
      const { container } = render(
        <LateWarningBanner lateCount={1} />
      );
      expect(container.firstChild).toBeNull();
    });
  });
});
