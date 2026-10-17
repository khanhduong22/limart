import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CheckInButtons from "./CheckInButtons";
import { CheckinTimerCard } from "./home/CheckinTimerCard";
import { CheckinHeaderCard } from "./home/CheckinHeaderCard";
import { useHomeCheckinStore } from "@/stores/useHomeCheckinStore";
import {
  recordConfirmedCheckin,
  mergeConfirmedCheckinsIntoHomeData,
  getLatestCheckin,
  LOCAL_CHECKIN_LEDGER_KEY,
} from "@/lib/api-client";

// In-memory mock for localStorage in Node 22 / JSDOM
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

// Mock canvas-confetti
vi.mock("canvas-confetti", () => ({
  default: vi.fn(),
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock api-client functions while keeping the real helper logic
const mockPerformCheckIn = vi.fn();
const mockGetIPStatus = vi.fn();
const mockGetTodayUserShiftDuties = vi.fn();

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    performCheckIn: (...args: any[]) => mockPerformCheckIn(...args),
    getIPStatus: () => mockGetIPStatus(),
    getTodayUserShiftDuties: (...args: any[]) => mockGetTodayUserShiftDuties(...args),
  };
});

describe("CheckInButtons Component & Frictionless Checkin Flow", () => {
  beforeEach(() => {
    useHomeCheckinStore.getState().reset();
    localStorage.clear();
    vi.clearAllMocks();

    mockGetIPStatus.mockResolvedValue({
      isAllowed: false,
      locationName: "Ngoài cửa hàng (4G)",
      ip: "14.161.20.10",
    });

    mockGetTodayUserShiftDuties.mockResolvedValue({
      success: true,
      data: [],
    });

    mockPerformCheckIn.mockResolvedValue({
      success: true,
      message: "Vào ca thành công!",
      data: {
        id: "chk_test_101",
        userId: "usr_001",
        type: "checkin",
        timestamp: new Date().toISOString(),
      },
      todayDuties: [],
    });

    // Mock geolocation to simulate immediate coordinate retrieval
    const mockGeolocation = {
      getCurrentPosition: vi.fn((success) =>
        success({
          coords: {
            latitude: 10.7769,
            longitude: 106.7009,
          },
        })
      ),
    };
    Object.defineProperty(global.navigator, "geolocation", {
      value: mockGeolocation,
      configurable: true,
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("tapping 'Vào Ca (Check-in)' succeeds even if initial ipStatus.isAllowed was false (delegates to backend) and immediately transitions the button to 'Tan Ca (Check-out)' without flickering back", async () => {
    const onCheckinSuccess = vi.fn();

    render(
      <CheckInButtons
        userId="usr_001"
        todayCheckins={[]}
        onCheckinSuccess={onCheckinSuccess}
      />
    );

    // Initial button state: Vào Ca
    const checkinBtn = screen.getByText("📍 Vào Ca (Check-in)");
    expect(checkinBtn).toBeDefined();

    // Click checkin button
    fireEvent.click(checkinBtn);

    // Verify performCheckIn was called directly without being blocked by initial false ipStatus
    await waitFor(() => {
      expect(mockPerformCheckIn).toHaveBeenCalledWith(
        "usr_001",
        "checkin",
        undefined,
        expect.objectContaining({ lat: 10.7769, lng: 106.7009 })
      );
    });

    // Verify button immediately transitions to 'Tan Ca (Check-out)' and 'Vào Ca' is no longer present
    await waitFor(() => {
      expect(screen.getByText("👋 Tan Ca (Check-out)")).toBeDefined();
      expect(screen.queryByText("📍 Vào Ca (Check-in)")).toBeNull();
    });

    // Verify onCheckinSuccess called immediately
    expect(onCheckinSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ id: "chk_test_101", type: "checkin" })
    );
  });
});

describe("Monotonic Hydration Guard (mergeConfirmedCheckinsIntoHomeData)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("protects a confirmed check-in from being wiped by a stale home-data response", () => {
    const confirmedRecord = {
      id: "chk_persisted_777",
      userId: "usr_001",
      type: "checkin",
      timestamp: new Date().toISOString(),
      note: "Vào ca thành công",
    };

    // 1. Record confirmed check-in in local ledger
    recordConfirmedCheckin(confirmedRecord);

    const savedLedger = JSON.parse(localStorage.getItem(LOCAL_CHECKIN_LEDGER_KEY) || "[]");
    expect(savedLedger).toHaveLength(1);
    expect(savedLedger[0].id).toBe("chk_persisted_777");

    // 2. Stale home-data response arrives from network with empty check-ins
    const staleHomeData: any = {
      user: { id: "usr_001", name: "Nhân viên LimArt" },
      todayCheckins: [],
      hasCheckedInToday: false,
    };

    // 3. Hydrate stale home-data through mergeConfirmedCheckinsIntoHomeData
    const hydrated = mergeConfirmedCheckinsIntoHomeData(staleHomeData);

    // 4. Assert checkin was preserved and hasCheckedInToday was restored to true
    expect(hydrated.hasCheckedInToday).toBe(true);
    expect(hydrated.todayCheckins).toHaveLength(1);
    expect(hydrated.todayCheckins[0].id).toBe("chk_persisted_777");
    expect(hydrated.todayCheckins[0].type).toBe("checkin");
  });

  it("avoids duplicate entries when the checkin is already present in homeData", () => {
    const confirmedRecord = {
      id: "chk_persisted_777",
      userId: "usr_001",
      type: "checkin",
      timestamp: new Date().toISOString(),
    };

    recordConfirmedCheckin(confirmedRecord);

    const upToDateHomeData: any = {
      user: { id: "usr_001", name: "Nhân viên LimArt" },
      todayCheckins: [confirmedRecord],
      hasCheckedInToday: true,
    };

    const result = mergeConfirmedCheckinsIntoHomeData(upToDateHomeData);
    expect(result.todayCheckins).toHaveLength(1);
  });
});

describe("Deterministic lastCheckin Resolution (ASC vs DESC order)", () => {
  const checkinMorning = {
    id: "chk_morning",
    type: "checkin",
    timestamp: "2026-10-17T08:00:00.000Z",
  };
  const checkoutNoon = {
    id: "chk_noon",
    type: "checkout",
    timestamp: "2026-10-17T12:00:00.000Z",
  };
  const checkinAfternoon = {
    id: "chk_afternoon",
    type: "checkin",
    timestamp: "2026-10-17T13:30:00.000Z",
  };

  const ascList = [checkinMorning, checkoutNoon, checkinAfternoon];
  const descList = [checkinAfternoon, checkoutNoon, checkinMorning];
  const unsortedList = [checkoutNoon, checkinMorning, checkinAfternoon];

  it("resolves the latest checkin identically whether todayCheckins is sorted ASC or DESC", () => {
    const latestFromAsc = getLatestCheckin(ascList);
    const latestFromDesc = getLatestCheckin(descList);
    const latestFromUnsorted = getLatestCheckin(unsortedList);

    expect(latestFromAsc?.id).toBe("chk_afternoon");
    expect(latestFromDesc?.id).toBe("chk_afternoon");
    expect(latestFromUnsorted?.id).toBe("chk_afternoon");
  });

  it("CheckinTimerCard and CheckinHeaderCard correctly detect active checkin with DESC list", () => {
    // Both components should identify the newest checkin (13:30 checkin) rather than the oldest (08:00 checkin)
    const { unmount: unmountTimer } = render(
      <CheckinTimerCard
        todayCheckins={descList}
        todayShift={{ end: "2026-10-17T17:30:00.000Z" }}
      />
    );

    expect(screen.getByText("Thời gian làm việc ca này")).toBeDefined();
    unmountTimer();

    render(
      <CheckinHeaderCard
        user={{ id: "usr_001", name: "Nguyễn Văn A", role: "STAFF" } as any}
        todayCheckins={descList}
      />
    );

    expect(screen.getByText("🟢 Đang làm việc")).toBeDefined();
  });
});
