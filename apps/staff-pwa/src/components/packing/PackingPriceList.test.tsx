import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { PackingPriceList } from "./PackingPriceList";
import type { PackingPriceItem } from "./PackingHistoryList";

describe("PackingPriceList Component", () => {
  const mockItems: PackingPriceItem[] = [
    {
      id: "pack-1",
      name: "Đóng gói đơn Shopee Hỏa Tốc",
      description: "Đóng gói kèm xốp chống sốc tiêu chuẩn",
      baseReward: 3000,
      unit: "đơn",
    },
    {
      id: "pack-2",
      name: "Đóng thùng carton lớn",
      description: "Thùng từ 10kg trở lên",
      baseReward: 8000,
      unit: "thùng",
    },
    {
      id: "pack-3",
      title: "Quấn màng co kiện hàng sỉ",
      baseReward: 5000,
      unit: "kiện",
    },
  ];

  it("renders loading state when isLoading is true", () => {
    render(
      <PackingPriceList
        priceList={[]}
        isLoading={true}
        onOpenModal={vi.fn()}
      />
    );

    expect(screen.getByText("Đang tải bảng quy đổi...")).toBeDefined();
  });

  it("renders empty state when priceList is empty and isLoading is false", () => {
    render(
      <PackingPriceList
        priceList={[]}
        isLoading={false}
        onOpenModal={vi.fn()}
      />
    );

    expect(screen.getByText("Chưa có danh mục đóng gói nào.")).toBeDefined();
  });

  it("renders list of packing price items with title, description, and reward badge", () => {
    render(
      <PackingPriceList
        priceList={mockItems}
        isLoading={false}
        onOpenModal={vi.fn()}
      />
    );

    expect(screen.getByText("Đóng gói đơn Shopee Hỏa Tốc")).toBeDefined();
    expect(screen.getByText("Đóng gói kèm xốp chống sốc tiêu chuẩn")).toBeDefined();
    expect(screen.getByText("+3,000đ / 1 đơn")).toBeDefined();

    expect(screen.getByText("Đóng thùng carton lớn")).toBeDefined();
    expect(screen.getByText("Thùng từ 10kg trở lên")).toBeDefined();
    expect(screen.getByText("+8,000đ / 1 thùng")).toBeDefined();

    // Item using 'title' instead of 'name' and without description
    expect(screen.getByText("Quấn màng co kiện hàng sỉ")).toBeDefined();
    expect(screen.getByText("+5,000đ / 1 kiện")).toBeDefined();
  });

  it("falls back to default title and unit when missing", () => {
    const itemWithoutTitleOrUnit: PackingPriceItem = {
      id: "pack-fallback",
      baseReward: 1500,
      unit: "",
    };

    render(
      <PackingPriceList
        priceList={[itemWithoutTitleOrUnit]}
        isLoading={false}
        onOpenModal={vi.fn()}
      />
    );

    expect(screen.getByText("Đóng gói")).toBeDefined();
    expect(screen.getByText("+1,500đ / 1 đơn")).toBeDefined();
  });

  it("triggers onOpenModal callback with correct item when clicking the declare button", () => {
    const handleOpenModal = vi.fn();
    render(
      <PackingPriceList
        priceList={mockItems}
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
