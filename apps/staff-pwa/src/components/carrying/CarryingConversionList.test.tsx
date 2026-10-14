import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  CarryingConversionList,
} from "./CarryingConversionList";
import type { CarryingPriceItem } from "./CarryingHistoryList";

describe("CarryingConversionList Component", () => {
  const mockItems: CarryingPriceItem[] = [
    {
      id: "def-1",
      name: "Bưng thùng sữa lên lầu 1",
      description: "Thùng 12 hộp sữa tươi 1L",
      baseReward: 5000,
      unit: "thùng",
    },
    {
      id: "def-2",
      name: "Bưng két bia lên lầu",
      description: "Két 24 lon bia Heineken",
      baseReward: 10000,
      unit: "két",
    },
    {
      id: "def-3",
      title: "Bưng bao gạo lên bếp",
      baseReward: 15000,
      unit: "bao",
    },
  ];

  it("renders loading state when isLoading is true", () => {
    render(
      <CarryingConversionList
        conversionList={[]}
        isLoading={true}
        onOpenModal={vi.fn()}
      />
    );

    expect(screen.getByText("Đang tải bảng quy đổi...")).toBeDefined();
  });

  it("renders empty state when conversionList is empty and isLoading is false", () => {
    render(
      <CarryingConversionList
        conversionList={[]}
        isLoading={false}
        onOpenModal={vi.fn()}
      />
    );

    expect(screen.getByText("Chưa có danh mục bưng hàng nào.")).toBeDefined();
  });

  it("renders list of conversion items with title, description, and reward badge", () => {
    render(
      <CarryingConversionList
        conversionList={mockItems}
        isLoading={false}
        onOpenModal={vi.fn()}
      />
    );

    expect(screen.getByText("Bưng thùng sữa lên lầu 1")).toBeDefined();
    expect(screen.getByText("Thùng 12 hộp sữa tươi 1L")).toBeDefined();
    expect(screen.getByText("+5,000đ / 1 thùng")).toBeDefined();

    expect(screen.getByText("Bưng két bia lên lầu")).toBeDefined();
    expect(screen.getByText("Két 24 lon bia Heineken")).toBeDefined();
    expect(screen.getByText("+10,000đ / 1 két")).toBeDefined();

    // Item using 'title' instead of 'name' and without description
    expect(screen.getByText("Bưng bao gạo lên bếp")).toBeDefined();
    expect(screen.getByText("+15,000đ / 1 bao")).toBeDefined();
  });

  it("falls back to default title and unit when missing", () => {
    const itemWithoutTitleOrUnit: CarryingPriceItem = {
      id: "def-fallback",
      baseReward: 2000,
      unit: "",
    };

    render(
      <CarryingConversionList
        conversionList={[itemWithoutTitleOrUnit]}
        isLoading={false}
        onOpenModal={vi.fn()}
      />
    );

    expect(screen.getByText("Bưng hàng")).toBeDefined();
    expect(screen.getByText("+2,000đ / 1 lượt")).toBeDefined();
  });

  it("triggers onOpenModal callback with correct item when clicking button", () => {
    const handleOpenModal = vi.fn();
    render(
      <CarryingConversionList
        conversionList={mockItems}
        isLoading={false}
        onOpenModal={handleOpenModal}
      />
    );

    const buttons = screen.getAllByRole("button", { name: /Khai báo/i });
    expect(buttons.length).toBe(3);

    fireEvent.click(buttons[1]);
    expect(handleOpenModal).toHaveBeenCalledTimes(1);
    expect(handleOpenModal).toHaveBeenCalledWith(mockItems[1]);
  });
});
