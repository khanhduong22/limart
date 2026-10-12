import { describe, it, expect, vi, beforeEach } from "vitest";

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

import {
  fetcher,
  performCheckIn,
  getIPStatus,
  getTodayUserShiftDuties,
  loginWithEmail,
  authFetch,
  DEFAULT_HOME_DATA,
  getAuthToken,
  setAuthToken,
  removeAuthToken,
  getAuthHeaders,
  toggleStaffTaskStatus,
} from "./api-client";

describe("Staff PWA API Client (Unified Cookie Auth)", () => {
  beforeEach(() => {
    storageMock.clear();
    vi.restoreAllMocks();
  });

  it("should return cached or fallback home data if network fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network Error"));

    const result = await fetcher("/api/staff/home-data");
    expect(result.success).toBe(true);
    expect(result.data.user.name).toBe(DEFAULT_HOME_DATA.user.name);
    expect(result.data.stats.totalHours).toBe(DEFAULT_HOME_DATA.stats.totalHours);
  });

  it("should return empty array fallback for non-home-data endpoints on error", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("404 Not Found"));

    const result = await fetcher("/api/staff/schedule");
    expect(result.success).toBe(false);
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data).toHaveLength(0);
  });

  it("should perform check-in online with credentials: include", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        message: "Chấm công vào ca thành công!",
        data: { id: "chk_123", type: "checkin" },
      }),
    } as any);
    global.fetch = mockFetch;

    const res = await performCheckIn("user_1", "checkin", "Đúng giờ");
    expect(res.success).toBe(true);
    expect(res.message).toContain("thành công");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/checkins",
      expect.objectContaining({
        credentials: "include",
      })
    );
  });

  it("should get IP status from backend or fallback", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          ipStatus: {
            isAllowed: true,
            locationName: "LimArt Store (Văn phòng chính)",
            ip: "192.168.1.100",
          },
        },
      }),
    } as any);

    const ip = await getIPStatus();
    expect(ip.isAllowed).toBe(true);
    expect(ip.locationName).toContain("LimArt");
  });

  it("should get today shift duties", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          todayDuties: [
            { id: "d1", title: "Nhiệm vụ kiểm kho", isCompleted: true },
          ],
        },
      }),
    } as any);

    const dutiesRes = await getTodayUserShiftDuties("user_1");
    expect(dutiesRes.success).toBe(true);
    expect(dutiesRes.data.length).toBe(1);
    expect(dutiesRes.data[0].title).toBe("Nhiệm vụ kiểm kho");
  });

  it("should return empty array when fetching shift duties fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const dutiesRes = await getTodayUserShiftDuties("user_1");
    expect(dutiesRes.success).toBe(true);
    expect(dutiesRes.data).toEqual([]);
  });

  it("should return friendly expired message and clear cache when check-in receives 401", async () => {
    storageMock.setItem("limart_staff_jwt_token", "stale_token");
    storageMock.setItem("limart_staff_profile_cache", '{"name":"Old"}');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "Unauthorized: Missing authentication cookie" }),
    });
    global.fetch = mockFetch;

    const res = await performCheckIn("user_1", "checkout");

    expect(storageMock.getItem("limart_staff_jwt_token")).toBeNull();
    expect(storageMock.getItem("limart_staff_profile_cache")).toBeNull();
    expect(res.success).toBe(false);
    expect(res.message).toBe("Phiên đăng nhập đã hết hạn. Vui lòng tải lại trang hoặc đăng nhập lại.");
  });

  it("authFetch should clear cache on 401 response", async () => {
    storageMock.setItem("limart_staff_jwt_token", "old_token");

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "Unauthorized" }),
    } as any);

    const res = await authFetch("/api/staff/tasks");
    expect(res.status).toBe(401);
    expect(storageMock.getItem("limart_staff_jwt_token")).toBeNull();
  });

  it("loginWithEmail returns friendly notice to use Google OAuth", async () => {
    const res = await loginWithEmail();
    expect(res.success).toBe(false);
    expect(res.error).toContain("Google");
  });

  describe("Token Storage & Dual-Auth Headers", () => {
    it("stores and retrieves auth token from localStorage", () => {
      expect(getAuthToken()).toBeNull();
      setAuthToken("jwt_test_123");
      expect(getAuthToken()).toBe("jwt_test_123");
      expect(getAuthHeaders()).toEqual({ Authorization: "Bearer jwt_test_123" });
      removeAuthToken();
      expect(getAuthToken()).toBeNull();
      expect(getAuthHeaders()).toEqual({});
    });

    it("attaches Authorization Bearer header when token is present in authFetch", async () => {
      setAuthToken("valid_bearer_token");
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      } as any);
      global.fetch = mockFetch;

      await authFetch("/api/staff/tasks");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/staff/tasks",
        expect.objectContaining({
          credentials: "include",
          headers: expect.objectContaining({
            Authorization: "Bearer valid_bearer_token",
          }),
        })
      );
    });

    it("sends toggleStaffTaskStatus with auth header and request payload", async () => {
      setAuthToken("task_token_abc");
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { id: "task-1", status: "DONE" } }),
      } as any);
      global.fetch = mockFetch;

      const res = await toggleStaffTaskStatus("task-1", {
        status: "DONE",
        evidenceLink: "https://photos.app.goo.gl/evidence",
        note: "Hoàn tất kiểm kho",
      });

      expect(res.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/staff/staff-tasks/task-1/toggle",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: "Bearer task_token_abc",
          }),
          body: JSON.stringify({
            status: "DONE",
            evidenceLink: "https://photos.app.goo.gl/evidence",
            note: "Hoàn tất kiểm kho",
          }),
        })
      );
    });

    it("handles network failure in toggleStaffTaskStatus gracefully", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network disconnect"));

      const res = await toggleStaffTaskStatus("task-1", { status: "DOING" });
      expect(res.success).toBe(false);
      expect(res.error).toBe("Network disconnect");
    });
  });
});
