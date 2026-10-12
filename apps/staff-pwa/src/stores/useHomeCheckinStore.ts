import { create } from "zustand";

export interface HomeCheckinStoreState {
  // Loading & Action States
  isCheckingIn: boolean;
  isCheckingOut: boolean;
  isScanningQR: boolean;

  // Modals & Dialogs
  showSuccessModal: boolean;
  activeWarningModal: boolean;
  showRejectedModal: boolean;
  dutyModalOpen: boolean;
  uncompletedWarningOpen: boolean;
  earlyCheckoutModalOpen: boolean;
  earlyCheckoutReason: string;

  // Working timer / elapsed seconds tracking
  elapsedSeconds: number;
  timerRunning: boolean;

  // Actions
  setIsCheckingIn: (val: boolean) => void;
  setIsCheckingOut: (val: boolean) => void;
  setIsScanningQR: (val: boolean) => void;
  setShowSuccessModal: (val: boolean) => void;
  setActiveWarningModal: (val: boolean) => void;
  setShowRejectedModal: (val: boolean) => void;
  setDutyModalOpen: (val: boolean) => void;
  setUncompletedWarningOpen: (val: boolean) => void;
  setEarlyCheckoutModalOpen: (val: boolean) => void;
  setEarlyCheckoutReason: (reason: string) => void;
  setElapsedSeconds: (seconds: number) => void;
  setTimerRunning: (running: boolean) => void;
  tickTimer: () => void;
  reset: () => void;
}

const initialState = {
  isCheckingIn: false,
  isCheckingOut: false,
  isScanningQR: false,
  showSuccessModal: false,
  activeWarningModal: false,
  showRejectedModal: false,
  dutyModalOpen: false,
  uncompletedWarningOpen: false,
  earlyCheckoutModalOpen: false,
  earlyCheckoutReason: "",
  elapsedSeconds: 0,
  timerRunning: false,
};

export const useHomeCheckinStore = create<HomeCheckinStoreState>((set) => ({
  ...initialState,

  setIsCheckingIn: (isCheckingIn) => set({ isCheckingIn }),
  setIsCheckingOut: (isCheckingOut) => set({ isCheckingOut }),
  setIsScanningQR: (isScanningQR) => set({ isScanningQR }),
  setShowSuccessModal: (showSuccessModal) => set({ showSuccessModal }),
  setActiveWarningModal: (activeWarningModal) => set({ activeWarningModal }),
  setShowRejectedModal: (showRejectedModal) => set({ showRejectedModal }),
  setDutyModalOpen: (dutyModalOpen) => set({ dutyModalOpen }),
  setUncompletedWarningOpen: (uncompletedWarningOpen) =>
    set({ uncompletedWarningOpen }),
  setEarlyCheckoutModalOpen: (earlyCheckoutModalOpen) =>
    set({ earlyCheckoutModalOpen }),
  setEarlyCheckoutReason: (earlyCheckoutReason) => set({ earlyCheckoutReason }),
  setElapsedSeconds: (elapsedSeconds) => set({ elapsedSeconds }),
  setTimerRunning: (timerRunning) => set({ timerRunning }),
  tickTimer: () => set((state) => ({ elapsedSeconds: state.elapsedSeconds + 1 })),
  reset: () => set(initialState),
}));
