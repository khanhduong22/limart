import { describe, it, expect, beforeEach } from "vitest";
import { useHomeCheckinStore } from "./useHomeCheckinStore";

describe("useHomeCheckinStore", () => {
  beforeEach(() => {
    useHomeCheckinStore.getState().reset();
  });

  it("should initialize with default states", () => {
    const state = useHomeCheckinStore.getState();
    expect(state.isCheckingIn).toBe(false);
    expect(state.isCheckingOut).toBe(false);
    expect(state.isScanningQR).toBe(false);
    expect(state.showSuccessModal).toBe(false);
    expect(state.dutyModalOpen).toBe(false);
    expect(state.uncompletedWarningOpen).toBe(false);
    expect(state.earlyCheckoutModalOpen).toBe(false);
    expect(state.showRejectedModal).toBe(false);
    expect(state.elapsedSeconds).toBe(0);
    expect(state.timerRunning).toBe(false);
  });

  it("should update check-in and check-out loading states", () => {
    const store = useHomeCheckinStore.getState();
    store.setIsCheckingIn(true);
    expect(useHomeCheckinStore.getState().isCheckingIn).toBe(true);

    store.setIsCheckingIn(false);
    store.setIsCheckingOut(true);
    expect(useHomeCheckinStore.getState().isCheckingOut).toBe(true);
  });

  it("should toggle modal states and update early checkout reason", () => {
    const store = useHomeCheckinStore.getState();
    store.setDutyModalOpen(true);
    store.setEarlyCheckoutModalOpen(true);
    store.setEarlyCheckoutReason("Bác sĩ hẹn khám");

    const state = useHomeCheckinStore.getState();
    expect(state.dutyModalOpen).toBe(true);
    expect(state.earlyCheckoutModalOpen).toBe(true);
    expect(state.earlyCheckoutReason).toBe("Bác sĩ hẹn khám");
  });

  it("should track elapsed timer seconds and reset state cleanly", () => {
    const store = useHomeCheckinStore.getState();
    store.setElapsedSeconds(100);
    store.tickTimer();
    expect(useHomeCheckinStore.getState().elapsedSeconds).toBe(101);

    store.reset();
    expect(useHomeCheckinStore.getState().elapsedSeconds).toBe(0);
    expect(useHomeCheckinStore.getState().earlyCheckoutReason).toBe("");
  });
});
