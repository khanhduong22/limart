import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  TaskFilterTabs,
  StaffTaskCard,
  TaskDetailModal,
  TaskSubmitModal,
} from "./index";
import { StaffTask } from "@/stores/useStaffTasksStore";

describe("Staff Tasks Components", () => {
  const mockTask: StaffTask = {
    id: "task-1",
    title: "Kiểm kho giấy vẽ",
    description: "Kiểm đếm số lượng giấy Arches 300gsm còn lại",
    status: "TODO",
    priority: "URGENT",
    deadline: "2026-10-25T17:00:00Z",
  };

  it("renders TaskFilterTabs and handles filter changes", () => {
    const onFilterChange = vi.fn();
    render(
      <TaskFilterTabs
        currentFilter="ALL"
        onFilterChange={onFilterChange}
        counts={{ ALL: 5, TODO: 2, DOING: 1, DONE: 1, APPROVED: 1 }}
      />
    );

    expect(screen.getByText("Tất cả (5)")).toBeDefined();
    expect(screen.getByText("Cần làm (2)")).toBeDefined();

    fireEvent.click(screen.getByText("Cần làm (2)"));
    expect(onFilterChange).toHaveBeenCalledWith("TODO");
  });

  it("renders StaffTaskCard with title, priority badge and triggers actions", () => {
    const onViewDetails = vi.fn();
    const onStartTask = vi.fn();
    const onSubmitTask = vi.fn();

    render(
      <StaffTaskCard
        task={mockTask}
        onViewDetails={onViewDetails}
        onStartTask={onStartTask}
        onSubmitTask={onSubmitTask}
      />
    );

    expect(screen.getByText("Kiểm kho giấy vẽ")).toBeDefined();
    expect(screen.getByText("⚡ Khẩn cấp")).toBeDefined();
    expect(screen.getByText("Cần làm")).toBeDefined();

    // Click start task button
    const startBtn = screen.getByText("Bắt đầu làm");
    fireEvent.click(startBtn);
    expect(onStartTask).toHaveBeenCalledWith("task-1");

    // Click card to view details
    fireEvent.click(screen.getByText("Kiểm kho giấy vẽ"));
    expect(onViewDetails).toHaveBeenCalledWith(mockTask);
  });

  it("renders TaskDetailModal and allows closing", () => {
    const onClose = vi.fn();
    render(
      <TaskDetailModal
        task={mockTask}
        onClose={onClose}
      />
    );

    expect(screen.getByText("Nội dung chi tiết công việc:")).toBeDefined();
    expect(screen.getByText("Kiểm đếm số lượng giấy Arches 300gsm còn lại")).toBeDefined();

    const closeBtn = screen.getByText("Đóng");
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it("renders TaskSubmitModal and submits form", () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    const onEvidenceChange = vi.fn();
    const onNoteChange = vi.fn();
    const onClose = vi.fn();

    render(
      <TaskSubmitModal
        task={mockTask}
        evidenceLink="https://drive.google.com/test"
        note="Đã kiểm đếm xong"
        onEvidenceLinkChange={onEvidenceChange}
        onNoteChange={onNoteChange}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    );

    expect(screen.getByText(/Báo cáo hoàn thành: Kiểm kho giấy vẽ/)).toBeDefined();

    const submitBtn = screen.getByText("Gửi kết quả");
    fireEvent.click(submitBtn);
    expect(onSubmit).toHaveBeenCalled();
  });
});
