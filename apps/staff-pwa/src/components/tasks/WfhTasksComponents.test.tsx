import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  MarketTaskList,
  GeneralTaskList,
  UserTaskHistoryList,
  WfhTaskTabs,
} from "./index";

describe("WFH Tasks Components", () => {
  describe("WfhTaskTabs", () => {
    it("renders tab items and triggers tab switch", () => {
      const onChangeTab = vi.fn();
      render(
        <WfhTaskTabs
          activeTab="market"
          onChangeTab={onChangeTab}
          marketCount={3}
          historyCount={5}
        />
      );

      expect(screen.getByText("Sàn việc (3)")).toBeDefined();
      expect(screen.getByText("Nhiệm vụ chung")).toBeDefined();
      expect(screen.getByText("Lịch sử (5)")).toBeDefined();

      fireEvent.click(screen.getByText("Lịch sử (5)"));
      expect(onChangeTab).toHaveBeenCalledWith("history");
    });
  });

  describe("MarketTaskList", () => {
    it("renders market tasks and handles claim action", () => {
      const onClaim = vi.fn();
      render(
        <MarketTaskList
          items={[
            {
              id: "m1",
              title: "Thiết kế banner Khai trương",
              description: "Banner kích thước 1200x630 cho fanpage",
              status: "OPEN",
              taskDefinition: {
                id: "def1",
                baseReward: 50000,
                unit: "ảnh",
                name: "Thiết kế đồ họa",
              },
            },
          ]}
          isLoading={false}
          isProcessing={false}
          onClaim={onClaim}
        />
      );

      expect(screen.getByText("Thiết kế banner Khai trương")).toBeDefined();
      expect(screen.getByText(/50[,.]000.*\/ảnh/)).toBeDefined();

      fireEvent.click(screen.getByText("Nhận Job Này"));
      expect(onClaim).toHaveBeenCalledWith("m1");
    });
  });

  describe("GeneralTaskList", () => {
    it("renders available tasks and handles start action", () => {
      const onStart = vi.fn();
      render(
        <GeneralTaskList
          tasks={[
            {
              id: "t1",
              title: "Đăng bài Facebook",
              description: "Đăng bài seeding nhóm cộng đồng",
              baseReward: 15000,
              unit: "bài",
            },
          ]}
          isLoading={false}
          isProcessing={false}
          onStart={onStart}
        />
      );

      expect(screen.getByText("Đăng bài Facebook")).toBeDefined();
      expect(screen.getByText(/15[,.]000.*\/bài/)).toBeDefined();

      fireEvent.click(screen.getByText("Bắt đầu nhận việc"));
      expect(onStart).toHaveBeenCalledWith("t1");
    });
  });

  describe("UserTaskHistoryList", () => {
    it("renders user tasks with status badge and handles submit click", () => {
      const onOpenSubmit = vi.fn();
      render(
        <UserTaskHistoryList
          tasks={[
            {
              id: "ut1",
              status: "PENDING",
              quantity: 2,
              unitPrice: 20000,
              createdAt: "2026-10-12T10:00:00Z",
              taskDefinition: {
                title: "Chụp ảnh sản phẩm",
                unit: "bộ",
              },
            },
            {
              id: "ut2",
              status: "APPROVED",
              quantity: 1,
              unitPrice: 50000,
              finalAmount: 50000,
              createdAt: "2026-10-11T10:00:00Z",
              taskDefinition: {
                title: "Viết bài review",
                unit: "bài",
              },
            },
          ]}
          isLoading={false}
          onOpenSubmit={onOpenSubmit}
        />
      );

      expect(screen.getByText("Chụp ảnh sản phẩm")).toBeDefined();
      expect(screen.getByText("Đang thực hiện")).toBeDefined();
      expect(screen.getByText("Viết bài review")).toBeDefined();
      expect(screen.getByText(/Đã duyệt/)).toBeDefined();

      fireEvent.click(screen.getByText("Nộp kết quả"));
      expect(onOpenSubmit).toHaveBeenCalled();
    });
  });
});
