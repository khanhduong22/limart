import { describe, it, expect, beforeEach } from "vitest";
import { useStaffTasksStore, StaffTask } from "./useStaffTasksStore";

describe("useStaffTasksStore", () => {
  beforeEach(() => {
    useStaffTasksStore.getState().reset();
  });

  const mockTask: StaffTask = {
    id: "task-101",
    title: "Vệ sinh quầy thanh toán",
    description: "Lau sạch bề mặt kính và máy quét mã vạch",
    status: "TODO",
    priority: "HIGH",
    evidenceLink: "https://example.com/evidence.jpg",
    notes: "Đã hoàn thành sạch sẽ",
  };

  it("should have correct initial state", () => {
    const state = useStaffTasksStore.getState();
    expect(state.filter).toBe("ALL");
    expect(state.finishingTask).toBeNull();
    expect(state.viewingTask).toBeNull();
    expect(state.evidenceLink).toBe("");
    expect(state.note).toBe("");
    expect(state.isProcessing).toBe(false);
  });

  it("should update filter", () => {
    useStaffTasksStore.getState().setFilter("DOING");
    expect(useStaffTasksStore.getState().filter).toBe("DOING");

    useStaffTasksStore.getState().setFilter("APPROVED");
    expect(useStaffTasksStore.getState().filter).toBe("APPROVED");
  });

  it("should open and close submit modal with prefilled data", () => {
    useStaffTasksStore.getState().openSubmitModal(mockTask);
    const state = useStaffTasksStore.getState();
    expect(state.finishingTask).toEqual(mockTask);
    expect(state.evidenceLink).toBe("https://example.com/evidence.jpg");
    expect(state.note).toBe("Đã hoàn thành sạch sẽ");

    useStaffTasksStore.getState().setEvidenceLink("https://new-link.com");
    useStaffTasksStore.getState().setNote("Cập nhật ghi chú mới");
    expect(useStaffTasksStore.getState().evidenceLink).toBe("https://new-link.com");
    expect(useStaffTasksStore.getState().note).toBe("Cập nhật ghi chú mới");

    useStaffTasksStore.getState().closeSubmitModal();
    const closedState = useStaffTasksStore.getState();
    expect(closedState.finishingTask).toBeNull();
    expect(closedState.evidenceLink).toBe("");
    expect(closedState.note).toBe("");
  });

  it("should open and close detail modal", () => {
    useStaffTasksStore.getState().openDetailModal(mockTask);
    expect(useStaffTasksStore.getState().viewingTask).toEqual(mockTask);

    useStaffTasksStore.getState().closeDetailModal();
    expect(useStaffTasksStore.getState().viewingTask).toBeNull();
  });

  it("should update isProcessing state and reset all fields cleanly", () => {
    const store = useStaffTasksStore.getState();
    store.setIsProcessing(true);
    store.setFilter("DONE");
    store.setEvidenceLink("https://link.com");
    store.setNote("Some note");

    let state = useStaffTasksStore.getState();
    expect(state.isProcessing).toBe(true);
    expect(state.filter).toBe("DONE");
    expect(state.evidenceLink).toBe("https://link.com");
    expect(state.note).toBe("Some note");

    store.reset();
    state = useStaffTasksStore.getState();
    expect(state.isProcessing).toBe(false);
    expect(state.filter).toBe("ALL");
    expect(state.evidenceLink).toBe("");
    expect(state.note).toBe("");
    expect(state.finishingTask).toBeNull();
    expect(state.viewingTask).toBeNull();
  });
});
