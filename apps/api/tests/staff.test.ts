import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockUserFindUnique,
  mockUserFindMany,
  mockWorkShiftFindMany,
  mockWorkShiftCreate,
  mockWorkShiftFindUnique,
  mockWorkShiftDelete,
  mockCheckInFindMany,
  mockCheckInFindFirst,
  mockAnnouncementFindMany,
  mockRequestFindMany,
  mockRequestCreate,
  mockAllowedIPFindMany,
  mockHolidayFindMany,
  mockPayrollPeriodFindUnique,
  mockShiftDutyFindUnique,
  mockShiftDutyUpdate,
  mockShiftDutyFindMany,
  mockLuckyWheelPrizeFindMany,
  mockLuckyWheelPrizeUpdate,
  mockLuckyWheelHistoryFindFirst,
  mockLuckyWheelHistoryFindMany,
  mockLuckyWheelHistoryCreate,
  mockWorkShiftUpdate,
  mockWorkShiftUpdateMany,
  mockWorkShiftFindFirst,
  mockStaffTaskFindMany,
  mockStaffTaskFindUnique,
  mockStaffTaskUpdate,
  mockStaffTaskCount,
  mockUserTaskFindMany,
  mockUserTaskFindUnique,
  mockUserTaskUpdate,
  mockUserTaskCreate,
  mockUserTaskCount,
  mockTaskDefFindMany,
  mockTaskDefFindUnique,
  mockTaskDefUpsert,
  mockTaskItemFindMany,
  mockTaskItemFindUnique,
  mockTaskItemUpdate,
  mockTaskItemUpdateMany,
  mockAnnouncementReadFindMany,
  mockAnnouncementReadUpsert,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockUserFindMany: vi.fn(),
  mockWorkShiftFindMany: vi.fn(),
  mockWorkShiftCreate: vi.fn(),
  mockWorkShiftFindUnique: vi.fn(),
  mockWorkShiftFindFirst: vi.fn(),
  mockWorkShiftDelete: vi.fn(),
  mockCheckInFindMany: vi.fn(),
  mockCheckInFindFirst: vi.fn(),
  mockAnnouncementFindMany: vi.fn(),
  mockAnnouncementReadFindMany: vi.fn(),
  mockAnnouncementReadUpsert: vi.fn(),
  mockRequestFindMany: vi.fn(),
  mockRequestCreate: vi.fn(),
  mockAllowedIPFindMany: vi.fn(),
  mockHolidayFindMany: vi.fn(),
  mockPayrollPeriodFindUnique: vi.fn(),
  mockShiftDutyFindUnique: vi.fn(),
  mockShiftDutyUpdate: vi.fn(),
  mockShiftDutyFindMany: vi.fn(),
  mockLuckyWheelPrizeFindMany: vi.fn(),
  mockLuckyWheelPrizeUpdate: vi.fn(),
  mockLuckyWheelHistoryFindFirst: vi.fn(),
  mockLuckyWheelHistoryFindMany: vi.fn(),
  mockLuckyWheelHistoryCreate: vi.fn(),
  mockWorkShiftUpdate: vi.fn(),
  mockWorkShiftUpdateMany: vi.fn(),
  mockStaffTaskFindMany: vi.fn(),
  mockStaffTaskFindUnique: vi.fn(),
  mockStaffTaskUpdate: vi.fn(),
  mockStaffTaskCount: vi.fn(),
  mockUserTaskFindMany: vi.fn(),
  mockUserTaskFindUnique: vi.fn(),
  mockUserTaskUpdate: vi.fn(),
  mockUserTaskCreate: vi.fn(),
  mockUserTaskCount: vi.fn(),
  mockTaskDefFindMany: vi.fn(),
  mockTaskDefFindUnique: vi.fn(),
  mockTaskDefUpsert: vi.fn(),
  mockTaskItemFindMany: vi.fn(),
  mockTaskItemFindUnique: vi.fn(),
  mockTaskItemUpdate: vi.fn(),
  mockTaskItemUpdateMany: vi.fn(),
}));

vi.mock("@checkin/db", () => ({
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
      findMany: mockUserFindMany,
    },
    workShift: {
      findMany: mockWorkShiftFindMany,
      create: mockWorkShiftCreate,
      findUnique: mockWorkShiftFindUnique,
      findFirst: mockWorkShiftFindFirst,
      update: mockWorkShiftUpdate,
      updateMany: mockWorkShiftUpdateMany,
      delete: mockWorkShiftDelete,
      count: vi.fn().mockResolvedValue(0),
    },
    checkIn: {
      findMany: mockCheckInFindMany,
      findFirst: mockCheckInFindFirst,
    },
    announcement: {
      findMany: mockAnnouncementFindMany,
    },
    announcementRead: {
      findMany: mockAnnouncementReadFindMany,
      upsert: mockAnnouncementReadUpsert,
    },
    request: {
      findMany: mockRequestFindMany,
      create: mockRequestCreate,
    },
    allowedIP: {
      findMany: mockAllowedIPFindMany,
    },
    holiday: {
      findMany: mockHolidayFindMany,
    },
    payrollPeriod: {
      findUnique: mockPayrollPeriodFindUnique,
    },
    payrollAdjustment: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    shiftDuty: {
      findUnique: mockShiftDutyFindUnique,
      update: mockShiftDutyUpdate,
      findMany: mockShiftDutyFindMany,
    },
    staffTask: {
      findMany: mockStaffTaskFindMany,
      count: mockStaffTaskCount,
      findUnique: mockStaffTaskFindUnique,
      update: mockStaffTaskUpdate,
      create: vi.fn().mockResolvedValue({}),
    },
    userTask: {
      findMany: mockUserTaskFindMany,
      count: mockUserTaskCount,
      findUnique: mockUserTaskFindUnique,
      update: mockUserTaskUpdate,
      create: mockUserTaskCreate,
    },
    taskDefinition: {
      findMany: mockTaskDefFindMany,
      findUnique: mockTaskDefFindUnique,
      upsert: mockTaskDefUpsert,
    },
    taskItem: {
      findMany: mockTaskItemFindMany,
      findUnique: mockTaskItemFindUnique,
      update: mockTaskItemUpdate,
      updateMany: mockTaskItemUpdateMany,
    },
    luckyWheelPrize: {
      findMany: mockLuckyWheelPrizeFindMany,
      update: mockLuckyWheelPrizeUpdate,
    },
    luckyWheelHistory: {
      findFirst: mockLuckyWheelHistoryFindFirst,
      findMany: mockLuckyWheelHistoryFindMany,
      create: mockLuckyWheelHistoryCreate,
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    $transaction: vi.fn(async (cb) => cb({
      taskItem: {
        findUnique: mockTaskItemFindUnique,
        update: mockTaskItemUpdate,
      },
      userTask: {
        create: mockUserTaskCreate,
        update: mockUserTaskUpdate,
        findUnique: mockUserTaskFindUnique,
      },
      taskDefinition: {
        findUnique: mockTaskDefFindUnique,
        upsert: mockTaskDefUpsert,
      },
    })),
  },
}));

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";

describe("Staff Routes", () => {
  let authToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCheckInFindMany.mockResolvedValue([]);
    mockWorkShiftFindMany.mockResolvedValue([]);
    mockRequestFindMany.mockResolvedValue([]);
    mockShiftDutyFindMany.mockResolvedValue([]);
    mockUserFindMany.mockResolvedValue([]);
    mockHolidayFindMany.mockResolvedValue([]);
    mockAnnouncementFindMany.mockResolvedValue([]);
    mockAnnouncementReadFindMany.mockResolvedValue([]);
    mockAnnouncementReadUpsert.mockResolvedValue({});
    mockStaffTaskFindMany.mockResolvedValue([]);
    mockStaffTaskFindUnique.mockResolvedValue(null);
    mockStaffTaskUpdate.mockResolvedValue({});
    mockStaffTaskCount.mockResolvedValue(0);
    mockUserTaskFindMany.mockResolvedValue([]);
    mockUserTaskFindUnique.mockResolvedValue(null);
    mockUserTaskUpdate.mockResolvedValue({});
    mockUserTaskCreate.mockResolvedValue({ id: "ut-1" });
    mockUserTaskCount.mockResolvedValue(0);
    mockTaskDefFindMany.mockResolvedValue([]);
    mockTaskDefFindUnique.mockResolvedValue(null);
    mockTaskDefUpsert.mockResolvedValue({ id: "td-1", baseReward: 50000 });
    mockTaskItemFindMany.mockResolvedValue([]);
    mockTaskItemFindUnique.mockResolvedValue(null);
    mockTaskItemUpdate.mockResolvedValue({});
    mockTaskItemUpdateMany.mockResolvedValue({ count: 1 });
    mockWorkShiftUpdate.mockResolvedValue({});
    mockWorkShiftUpdateMany.mockResolvedValue({ count: 1 });
    mockWorkShiftFindFirst.mockResolvedValue(null);
    authToken = await signAccessToken({
      sub: "staff-1",
      email: "staff@example.com",
      role: "USER",
    });
  });

  describe("GET /api/staff/home-data", () => {
    it("returns 401 without auth", async () => {
      const res = await app.request("/api/staff/home-data");
      expect(res.status).toBe(401);
    });

    it("returns comprehensive aggregate home data when authenticated", async () => {
      mockUserFindUnique.mockResolvedValue({
        id: "staff-1",
        name: "Staff One",
        email: "staff@example.com",
        role: "USER",
        isActive: true,
        employmentType: "PART_TIME",
        hourlyRate: 35000,
        monthlySalary: 6000000,
        birthday: new Date("2000-01-15"),
        startDate: new Date("2024-03-01"),
        luckyWheelAllowed: true,
        achievements: [
          { id: "ach-1", code: "LUCKY_STAR", title: "Ngôi sao may mắn" },
        ],
        adjustments: [],
        payslips: [],
      });

      mockWorkShiftFindMany.mockResolvedValue([
        {
          id: 101,
          userId: "staff-1",
          start: new Date(),
          end: new Date(),
          isSenior: false,
        },
      ]);

      mockCheckInFindMany.mockResolvedValue([
        {
          id: 201,
          userId: "staff-1",
          type: "checkin",
          timestamp: new Date(),
        },
      ]);

      mockAnnouncementFindMany.mockResolvedValue([
        {
          id: "ann-1",
          title: "Cuộc họp sáng",
          content: "Tất cả có mặt lúc 9h",
          type: "INFO",
          active: true,
        },
      ]);

      mockRequestFindMany.mockResolvedValue([]); // recentLeaves for streak
      mockAllowedIPFindMany.mockResolvedValue([]); // allowedIP for ipStatus

      const res = await app.request("/api/staff/home-data", {
        headers: {
          Cookie: `access_token=${authToken}`,
        },
      });

      if (res.status !== 200) {
        console.error("Home data error:", await res.text());
      }
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.user.name).toBe("Staff One");
      expect(data.data.user.achievements).toHaveLength(1);
      expect(data.data.todayShifts).toHaveLength(1);
      expect(data.data.todayCheckins).toHaveLength(1);
      expect(data.data.announcements).toHaveLength(1);
      expect(typeof data.data.streak).toBe("number");
      expect(data.data.ipStatus).toBeDefined();
    });

    it("returns only active users with assigned duties today in activeUsers", async () => {
      mockUserFindUnique.mockResolvedValue({
        id: "staff-1",
        name: "Staff One",
        email: "staff@example.com",
        role: "USER",
        isActive: true,
        employmentType: "PART_TIME",
        hourlyRate: 35000,
        monthlySalary: 6000000,
        birthday: new Date("2000-01-15"),
        startDate: new Date("2024-03-01"),
        luckyWheelAllowed: true,
        achievements: [],
        adjustments: [],
        payslips: [],
      });

      mockShiftDutyFindMany.mockResolvedValue([
        {
          id: "duty-1",
          userId: "staff-1",
          createdById: "admin-1",
          date: new Date(),
          title: "Kiểm tra màu nước Holbein",
          description: "Đếm số lượng tuýp 15ml",
          isCompleted: false,
          completedAt: null,
          createdAt: new Date(),
          user: {
            id: "staff-1",
            name: "Staff One",
            email: "staff@example.com",
            image: null,
            role: "USER",
            isActive: true,
          },
        },
        {
          id: "duty-2",
          userId: "staff-2",
          createdById: "admin-1",
          date: new Date(),
          title: "Vệ sinh quầy cọ vẽ",
          description: "Lau sạch bụi kệ cọ tỉa",
          isCompleted: true,
          completedAt: new Date(),
          createdAt: new Date(),
          user: {
            id: "staff-2",
            name: "Staff Two",
            email: "staff2@example.com",
            image: null,
            role: "USER",
            isActive: true,
          },
        },
      ]);

      const res = await app.request("/api/staff/home-data", {
        headers: { Cookie: `access_token=${authToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Current user's duties
      expect(json.data.todayDuties).toHaveLength(1);
      expect(json.data.todayDuties[0].id).toBe("duty-1");

      // Active users with duties today (both staff-1 and staff-2)
      expect(json.data.activeUsers).toHaveLength(2);
      expect(json.data.activeUsers[0].name).toBe("Staff One");
      expect(json.data.activeUsers[0].duties).toHaveLength(1);
      expect(json.data.activeUsers[1].name).toBe("Staff Two");
      expect(json.data.activeUsers[1].duties).toHaveLength(1);
      expect(json.data.activeUsers[1].duties[0].title).toBe("Vệ sinh quầy cọ vẽ");
      expect(json.data.teammatesWithDuties).toHaveLength(2);
    });

    it("returns rejected tasks details and count when user has rejected tasks", async () => {
      mockUserFindUnique.mockResolvedValue({
        id: "staff-1",
        name: "Staff One",
        email: "staff@example.com",
        role: "USER",
        isActive: true,
        employmentType: "PART_TIME",
        hourlyRate: 35000,
        monthlySalary: 6000000,
        adjustments: [],
        payslips: [],
        achievements: [],
      });

      mockStaffTaskFindMany.mockResolvedValue([
        {
          id: "st-rej-1",
          title: "Kiểm kê kho cọ",
          adminNote: "Thiếu ảnh chụp kệ số 2",
          submittedAt: new Date("2026-10-10"),
          createdAt: new Date("2026-10-09"),
        },
      ]);

      mockUserTaskFindMany.mockResolvedValue([
        {
          id: "ut-rej-1",
          quantity: 5,
          unitPrice: 3000,
          note: "Đóng gói bảng vẽ",
          evidenceLink: "https://drive.google.com/test",
          adminNote: "Hộp bị móp góc, yêu cầu đóng lại",
          submittedAt: new Date("2026-10-11"),
          createdAt: new Date("2026-10-10"),
          taskDefinition: { id: "td-1", name: "Đóng gói", unit: "điểm", baseReward: 3000 },
          taskItem: { id: "ti-1", title: "Đóng gói bảng 50x70" },
        },
      ]);

      const res = await app.request("/api/staff/home-data", {
        headers: { Cookie: `access_token=${authToken}` },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.rejectedTasksCount).toBe(2);
      expect(json.data.rejectedTasks).toHaveLength(2);
      expect(json.data.rejectedTasks[0]).toEqual({
        id: "st-rej-1",
        type: "STAFF_TASK",
        title: "Kiểm kê kho cọ",
        reason: "Thiếu ảnh chụp kệ số 2",
        date: expect.any(String),
        link: "/staff-tasks",
      });
      expect(json.data.rejectedTasks[1]).toEqual({
        id: "ut-rej-1",
        type: "PACKING",
        title: "Đóng gói bảng 50x70",
        reason: "Hộp bị móp góc, yêu cầu đóng lại",
        date: expect.any(String),
        link: "/packing?tab=history",
      });
    });
  });

  describe("GET /api/staff/schedule", () => {
    it("returns 401 without auth", async () => {
      const res = await app.request("/api/staff/schedule");
      expect(res.status).toBe(401);
    });

    it("returns monthly shifts with currentUserId when authenticated", async () => {
      const mockShifts = [
        {
          id: 1,
          userId: "staff-1",
          start: new Date("2026-10-15T08:30:00Z"),
          end: new Date("2026-10-15T12:00:00Z"),
          shiftType: "MORNING",
          status: "APPROVED",
          user: {
            id: "staff-1",
            name: "Staff One",
            image: null,
            email: "staff@example.com",
          },
        },
      ];
      mockWorkShiftFindMany.mockResolvedValue(mockShifts);

      const res = await app.request("/api/staff/schedule?month=10&year=2026", {
        headers: { Cookie: `access_token=${authToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data).toHaveLength(1);
      expect(json.currentUserId).toBe("staff-1");
    });
  });

  describe("POST /api/staff/schedule/register", () => {
    it("returns 400 for invalid payload", async () => {
      const res = await app.request("/api/staff/schedule/register", {
        method: "POST",
        headers: {
          Cookie: `access_token=${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ shift: "INVALID" }),
      });
      expect(res.status).toBe(400);
    });

    it("registers shift successfully with correct start/end times", async () => {
      mockWorkShiftCreate.mockResolvedValue({
        id: 105,
        userId: "staff-1",
        start: new Date("2026-10-15T01:30:00.000Z"),
        end: new Date("2026-10-15T05:00:00.000Z"),
        shiftType: "MORNING",
        status: "APPROVED",
        user: { id: "staff-1", name: "Staff One", image: null, email: "staff@example.com" },
      });

      const res = await app.request("/api/staff/schedule/register", {
        method: "POST",
        headers: {
          Cookie: `access_token=${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateStr: "2026-10-15",
          shift: "MORNING",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.shiftType).toBe("MORNING");
      expect(mockWorkShiftCreate).toHaveBeenCalledTimes(1);
    });

    it("registers shift with flexible custom hours (no fixed shift, no fixed hours)", async () => {
      mockWorkShiftCreate.mockResolvedValue({
        id: 106,
        userId: "staff-1",
        start: new Date("2026-10-15T02:00:00.000Z"),
        end: new Date("2026-10-15T07:30:00.000Z"),
        shiftType: "CUSTOM",
        status: "APPROVED",
        user: { id: "staff-1", name: "Staff One", image: null, email: "staff@example.com" },
      });

      const res = await app.request("/api/staff/schedule/register", {
        method: "POST",
        headers: {
          Cookie: `access_token=${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateStr: "2026-10-15",
          startTime: "09:00",
          endTime: "14:30",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.shiftType).toBe("CUSTOM");
      expect(mockWorkShiftCreate).toHaveBeenCalledTimes(1);
    });

    it("returns 400 when end time is before or equal to start time", async () => {
      const res = await app.request("/api/staff/schedule/register", {
        method: "POST",
        headers: {
          Cookie: `access_token=${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateStr: "2026-10-15",
          startTime: "16:00",
          endTime: "14:00",
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Giờ kết thúc phải sau giờ bắt đầu");
    });

    it("returns 400 when start hour is outside 8-17", async () => {
      const res = await app.request("/api/staff/schedule/register", {
        method: "POST",
        headers: {
          Cookie: `access_token=${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateStr: "2026-10-15",
          startTime: "07:00",
          endTime: "12:00",
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Giờ bắt đầu chỉ được từ 8h đến 17h");
    });

    it("returns 400 when end hour is outside 11-21", async () => {
      const res = await app.request("/api/staff/schedule/register", {
        method: "POST",
        headers: {
          Cookie: `access_token=${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateStr: "2026-10-15",
          startTime: "09:00",
          endTime: "22:00",
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Giờ kết thúc chỉ được từ 11h đến 21h");
    });

    it("returns 400 when minute is not in [0, 15, 30, 45]", async () => {
      const res = await app.request("/api/staff/schedule/register", {
        method: "POST",
        headers: {
          Cookie: `access_token=${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateStr: "2026-10-15",
          startTime: "09:10",
          endTime: "12:00",
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Số phút chỉ được chọn: 0, 15, 30 hoặc 45");
    });

    it("returns 400 when shift overlaps with existing shift", async () => {
      mockWorkShiftFindFirst.mockResolvedValue({
        id: 99,
        userId: "staff-1",
        start: new Date("2026-10-15T01:30:00.000Z"),
        end: new Date("2026-10-15T05:00:00.000Z"),
      });

      const res = await app.request("/api/staff/schedule/register", {
        method: "POST",
        headers: {
          Cookie: `access_token=${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateStr: "2026-10-15",
          startTime: "09:00",
          endTime: "11:00",
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("trùng khung giờ");
    });
  });

  describe("POST /api/staff/schedule/cancel", () => {
    it("returns 404 when shift not found", async () => {
      mockWorkShiftFindUnique.mockResolvedValue(null);

      const res = await app.request("/api/staff/schedule/cancel", {
        method: "POST",
        headers: {
          Cookie: `access_token=${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ shiftId: 999 }),
      });

      expect(res.status).toBe(404);
    });

    it("cancels shift successfully when owned by user", async () => {
      mockWorkShiftFindUnique.mockResolvedValue({
        id: 105,
        userId: "staff-1",
      });
      mockWorkShiftDelete.mockResolvedValue({ id: 105 });

      const res = await app.request("/api/staff/schedule/cancel", {
        method: "POST",
        headers: {
          Cookie: `access_token=${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ shiftId: 105 }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(mockWorkShiftDelete).toHaveBeenCalledWith({ where: { id: 105 } });
    });
  });

  describe("GET /api/staff/payroll", () => {
    it("returns 401 without auth", async () => {
      const res = await app.request("/api/staff/payroll");
      expect(res.status).toBe(401);
    });

    it("returns payroll data with stats and isClosed flag", async () => {
      mockUserFindUnique.mockResolvedValue({
        id: "staff-1",
        name: "Staff One",
        employmentType: "PART_TIME",
        hourlyRate: 25000,
        monthlySalary: 6000000,
        adjustments: [],
        payslips: [],
      });
      mockCheckInFindMany.mockResolvedValue([]);
      mockWorkShiftFindMany.mockResolvedValue([]);
      mockRequestFindMany.mockResolvedValue([]);
      mockHolidayFindMany.mockResolvedValue([]);
      mockPayrollPeriodFindUnique.mockResolvedValue({ status: "OPEN" });

      const res = await app.request("/api/staff/payroll?month=10&year=2026", {
        headers: { Cookie: `access_token=${authToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.stats).toBeDefined();
      expect(json.data.isClosed).toBe(false);
      expect(json.data.month).toBe(10);
      expect(json.data.year).toBe(2026);
    });
  });

  describe("GET /api/staff/history", () => {
    it("returns 401 without auth", async () => {
      const res = await app.request("/api/staff/history");
      expect(res.status).toBe(401);
    });

    it("returns user checkin history", async () => {
      mockCheckInFindMany.mockResolvedValue([
        { id: 1, userId: "staff-1", type: "checkin", timestamp: new Date() },
        { id: 2, userId: "staff-1", type: "checkout", timestamp: new Date() },
      ]);

      const res = await app.request("/api/staff/history", {
        headers: { Cookie: `access_token=${authToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(2);
    });
  });

  describe("GET and POST /api/staff/requests", () => {
    it("GET /api/staff/requests returns user requests", async () => {
      mockRequestFindMany.mockResolvedValue([
        { id: 1, userId: "staff-1", type: "LEAVE", reason: "Nghỉ ốm", status: "PENDING" },
      ]);

      const res = await app.request("/api/staff/requests", {
        headers: { Cookie: `access_token=${authToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(1);
    });

    it("POST /api/staff/requests returns 400 for missing fields", async () => {
      const res = await app.request("/api/staff/requests", {
        method: "POST",
        headers: {
          Cookie: `access_token=${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: "LEAVE" }),
      });

      expect(res.status).toBe(400);
    });

    it("POST /api/staff/requests creates request successfully", async () => {
      mockRequestCreate.mockResolvedValue({
        id: 10,
        userId: "staff-1",
        type: "WFH",
        date: new Date("2026-10-20"),
        reason: "Làm việc tại nhà",
        status: "PENDING",
      });

      const res = await app.request("/api/staff/requests", {
        method: "POST",
        headers: {
          Cookie: `access_token=${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "WFH",
          date: "2026-10-20",
          reason: "Làm việc tại nhà",
        }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.type).toBe("WFH");
    });
  });

  describe("Schedule Swap & Take Endpoints", () => {
    it("POST /api/staff/schedule/:id/swap toggles isOpenForSwap on user's shift", async () => {
      mockWorkShiftFindUnique.mockResolvedValue({
        id: 101,
        userId: "staff-1",
        isOpenForSwap: false,
      });
      mockWorkShiftUpdate.mockResolvedValue({
        id: 101,
        userId: "staff-1",
        isOpenForSwap: true,
      });

      const res = await app.request("/api/staff/schedule/101/swap", {
        method: "POST",
        headers: { Cookie: `access_token=${authToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.isOpenForSwap).toBe(true);
    });

    it("POST /api/staff/schedule/:id/take fails if user tries to take own shift", async () => {
      mockWorkShiftFindUnique.mockResolvedValue({
        id: 102,
        userId: "staff-1",
        isOpenForSwap: true,
        start: new Date("2026-10-20T08:00:00Z"),
        end: new Date("2026-10-20T12:00:00Z"),
      });

      const res = await app.request("/api/staff/schedule/102/take", {
        method: "POST",
        headers: { Cookie: `access_token=${authToken}` },
      });

      expect(res.status).toBe(400);
    });

    it("POST /api/staff/schedule/:id/take successfully claims colleague's open shift", async () => {
      mockWorkShiftFindUnique.mockResolvedValue({
        id: 102,
        userId: "staff-2",
        isOpenForSwap: true,
        start: new Date("2026-10-20T08:00:00Z"),
        end: new Date("2026-10-20T12:00:00Z"),
      });
      mockWorkShiftFindMany.mockResolvedValue([]); // no overlapping shifts
      mockWorkShiftUpdateMany.mockResolvedValue({ count: 1 });
      mockWorkShiftFindUnique.mockResolvedValueOnce({
        id: 102,
        userId: "staff-2",
        isOpenForSwap: true,
        start: new Date("2026-10-20T08:00:00Z"),
        end: new Date("2026-10-20T12:00:00Z"),
      }).mockResolvedValueOnce({
        id: 102,
        userId: "staff-1",
        isOpenForSwap: false,
      });

      const res = await app.request("/api/staff/schedule/102/take", {
        method: "POST",
        headers: { Cookie: `access_token=${authToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.userId).toBe("staff-1");
    });
  });

  describe("Tasks & WFH Endpoints", () => {
    it("GET /api/staff/tasks/market returns open task items", async () => {
      mockTaskItemFindMany.mockResolvedValue([
        {
          id: "item-1",
          title: "Thiết kế banner WFH",
          status: "OPEN",
          taskDef: { title: "Thiết kế", baseReward: 100000, unit: "lần" },
        },
      ]);

      const res = await app.request("/api/staff/tasks/market", {
        headers: { Cookie: `access_token=${authToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(1);
    });

    it("GET /api/staff/tasks/available returns active task definitions", async () => {
      mockTaskDefFindMany.mockResolvedValue([
        { id: "td-1", title: "Viết bài review", baseReward: 50000, isActive: true },
      ]);

      const res = await app.request("/api/staff/tasks/available", {
        headers: { Cookie: `access_token=${authToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data[0].title).toBe("Viết bài review");
    });

    it("GET /api/staff/tasks/my returns user task history", async () => {
      mockUserTaskFindMany.mockResolvedValue([
        {
          id: "ut-1",
          userId: "staff-1",
          status: "PENDING",
          quantity: 1,
          rewardAmount: 50000,
          taskDef: { title: "Viết bài" },
        },
      ]);

      const res = await app.request("/api/staff/tasks/my", {
        headers: { Cookie: `access_token=${authToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(1);
    });

    it("POST /api/staff/tasks/claim reserves an open market item", async () => {
      mockTaskItemFindUnique.mockResolvedValue({
        id: "item-1",
        status: "OPEN",
        taskDefId: "td-1",
        title: "Banner Task",
      });
      mockTaskDefFindUnique.mockResolvedValue({
        id: "td-1",
        baseReward: 100000,
      });
      mockUserTaskCreate.mockResolvedValue({
        id: "ut-1",
        userId: "staff-1",
        taskItemId: "item-1",
        status: "CLAIMED",
      });

      const res = await app.request("/api/staff/tasks/claim", {
        method: "POST",
        headers: {
          Cookie: `access_token=${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ taskItemId: "item-1" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it("POST /api/staff/tasks/start begins work on claimed task", async () => {
      mockTaskDefFindUnique.mockResolvedValue({
        id: "td-1",
        title: "Thiết kế banner",
        unit: "lần",
        baseReward: 50000,
        active: true,
      });
      mockCheckInFindFirst.mockResolvedValue(null); // Not checked in at office
      mockUserTaskCreate.mockResolvedValue({
        id: "ut-1",
        userId: "staff-1",
        taskDefId: "td-1",
        status: "PENDING",
      });

      const res = await app.request("/api/staff/tasks/start", {
        method: "POST",
        headers: {
          Cookie: `access_token=${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ taskDefId: "td-1" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it("POST /api/staff/tasks/submit finishes task with evidence", async () => {
      mockUserTaskFindUnique.mockResolvedValue({
        id: "ut-1",
        userId: "staff-1",
        status: "PENDING",
        quantity: 1,
        note: "",
        evidenceLink: "",
      });
      mockUserTaskUpdate.mockResolvedValue({
        id: "ut-1",
        status: "SUBMITTED",
        evidenceLink: "https://drive.google.com/test",
      });

      const res = await app.request("/api/staff/tasks/submit", {
        method: "POST",
        headers: {
          Cookie: `access_token=${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userTaskId: "ut-1",
          quantity: 2,
          evidenceLink: "https://drive.google.com/test",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });

  describe("Packing & Carrying Endpoints", () => {
    it("GET /api/staff/tasks/packing-summary returns packing stats and history", async () => {
      mockTaskDefFindMany.mockResolvedValue([]);
      mockUserTaskFindMany.mockResolvedValue([
        {
          id: "ut-p1",
          userId: "staff-1",
          status: "APPROVED",
          quantity: 10,
          rewardAmount: 50000,
          notes: "10 đơn COD",
          taskDefinition: { unit: "điểm" },
          createdAt: new Date(),
        },
      ]);

      const res = await app.request("/api/staff/tasks/packing-summary", {
        headers: { Cookie: `access_token=${authToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.totalPoints).toBe(10);
    });

    it("POST /api/staff/tasks/submit-packing submits packing record", async () => {
      mockTaskDefFindUnique.mockResolvedValue({
        id: "td-packing",
        title: "Đóng hàng",
        unit: "điểm",
        baseReward: 5000,
        active: true,
      });
      mockUserTaskCreate.mockResolvedValue({
        id: "ut-pack-1",
        userId: "staff-1",
        quantity: 15,
        status: "SUBMITTED",
      });

      const res = await app.request("/api/staff/tasks/submit-packing", {
        method: "POST",
        headers: {
          Cookie: `access_token=${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          taskDefId: "td-packing",
          quantity: 15,
          note: "Khai báo ca chiều",
          evidenceLink: "https://photo.example.com/1",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it("GET /api/staff/tasks/carrying-summary returns carrying stats and history", async () => {
      mockTaskDefFindMany.mockResolvedValue([]);
      mockUserTaskFindMany.mockResolvedValue([]);

      const res = await app.request("/api/staff/tasks/carrying-summary", {
        headers: { Cookie: `access_token=${authToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.totalPoints).toBe(0);
    });

    it("POST /api/staff/tasks/submit-carrying submits carrying record", async () => {
      mockTaskDefFindUnique.mockResolvedValue({
        id: "td-carrying",
        title: "Bưng hàng",
        unit: "điểm-bưng",
        baseReward: 20000,
        active: true,
      });
      mockUserTaskCreate.mockResolvedValue({
        id: "ut-carry-1",
        userId: "staff-1",
        quantity: 2,
        status: "SUBMITTED",
      });

      const res = await app.request("/api/staff/tasks/submit-carrying", {
        method: "POST",
        headers: {
          Cookie: `access_token=${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          taskDefId: "td-carrying",
          quantity: 2,
          note: "Bưng bao hàng lên lầu",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });

  describe("Rewards Leaderboard", () => {
    it("GET /api/staff/rewards/leaderboard returns 5 leaderboard categories", async () => {
      mockUserFindMany.mockResolvedValue([
        {
          id: "staff-1",
          name: "Nguyễn Văn A",
          role: "USER",
          isActive: true,
          employmentType: "PART_TIME",
        },
      ]);
      mockWorkShiftFindMany.mockResolvedValue([]);
      mockCheckInFindMany.mockResolvedValue([]);
      mockUserTaskFindMany.mockResolvedValue([]);

      const res = await app.request("/api/staff/rewards/leaderboard?month=10&year=2026", {
        headers: { Cookie: `access_token=${authToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveProperty("topDiscipline");
      expect(json.data).toHaveProperty("topHardworking");
      expect(json.data).toHaveProperty("topOvertime");
      expect(json.data).toHaveProperty("topPacking");
      expect(json.data).toHaveProperty("topCarrying");
    });
  });

  describe("Staff Tasks & KPI", () => {
    it("GET /api/staff/staff-tasks returns 403 if user not permitted", async () => {
      mockUserFindUnique.mockResolvedValue({
        id: "staff-1",
        role: "USER",
        staffTasksAllowed: false,
      });

      const res = await app.request("/api/staff/staff-tasks", {
        headers: { Cookie: `access_token=${authToken}` },
      });

      expect(res.status).toBe(403);
    });

    it("GET /api/staff/staff-tasks returns tasks and stats when allowed", async () => {
      mockUserFindUnique.mockResolvedValue({
        id: "staff-1",
        role: "USER",
        staffTasksAllowed: true,
      });
      mockStaffTaskFindMany.mockResolvedValue([
        {
          id: "st-1",
          assigneeId: "staff-1",
          title: "Vệ sinh bàn làm việc",
          status: "TODO",
          frequency: "DAILY",
          createdAt: new Date(),
        },
      ]);
      mockStaffTaskCount.mockResolvedValue(1);

      const res = await app.request("/api/staff/staff-tasks", {
        headers: { Cookie: `access_token=${authToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.tasks).toHaveLength(1);
      expect(json.data).toHaveProperty("stats");
    });

    it("GET /api/staff/staff-tasks returns tasks and stats when user role is PARTNER even if staffTasksAllowed is false", async () => {
      mockUserFindUnique.mockResolvedValue({
        id: "staff-1",
        role: "PARTNER",
        staffTasksAllowed: false,
      });
      mockStaffTaskFindMany.mockResolvedValue([
        {
          id: "st-partner-1",
          assigneeId: "staff-1",
          title: "Thiết kế poster màu nước",
          status: "TODO",
          createdAt: new Date(),
        },
      ]);

      const res = await app.request("/api/staff/staff-tasks", {
        headers: { Cookie: `access_token=${authToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.tasks).toHaveLength(1);
      expect(json.data.tasks[0].id).toBe("st-partner-1");
    });

    it("POST /api/staff/staff-tasks/:id/toggle advances task status for PARTNER role", async () => {
      mockUserFindUnique.mockResolvedValue({
        id: "staff-1",
        role: "PARTNER",
        staffTasksAllowed: false,
      });
      mockStaffTaskFindUnique.mockResolvedValue({
        id: "st-partner-1",
        assigneeId: "staff-1",
        status: "TODO",
      });
      mockStaffTaskUpdate.mockResolvedValue({
        id: "st-partner-1",
        assigneeId: "staff-1",
        status: "DOING",
      });

      const res = await app.request("/api/staff/staff-tasks/st-partner-1/toggle", {
        method: "POST",
        headers: {
          Cookie: `access_token=${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "DOING" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("DOING");
    });
  });

  describe("Announcement Read Endpoints", () => {
    it("POST /api/staff/announcements/read returns 401 without auth", async () => {
      const res = await app.request("/api/staff/announcements/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ["ann-1"] }),
      });
      expect(res.status).toBe(401);
    });

    it("POST /api/staff/announcements/read returns 400 for empty or invalid ids", async () => {
      const res1 = await app.request("/api/staff/announcements/read", {
        method: "POST",
        headers: {
          Cookie: `access_token=${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: [] }),
      });
      expect(res1.status).toBe(400);

      const res2 = await app.request("/api/staff/announcements/read", {
        method: "POST",
        headers: {
          Cookie: `access_token=${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      expect(res2.status).toBe(400);
    });

    it("POST /api/staff/announcements/read records reads and returns 200 with count", async () => {
      const res = await app.request("/api/staff/announcements/read", {
        method: "POST",
        headers: {
          Cookie: `access_token=${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: ["ann-1", "ann-2"] }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.count).toBe(2);
      expect(mockAnnouncementReadUpsert).toHaveBeenCalledTimes(2);
    });

    it("GET /api/staff/home-data attaches isRead true when announcement has been read", async () => {
      mockAnnouncementReadFindMany.mockResolvedValue([{ announcementId: "ann-1" }]);
      mockAnnouncementFindMany.mockResolvedValue([
        {
          id: "ann-1",
          title: "Cuộc họp sáng",
          content: "Tất cả có mặt lúc 9h",
          type: "INFO",
          active: true,
          createdAt: new Date(),
        },
        {
          id: "ann-2",
          title: "Thông báo mới",
          content: "Chưa đọc",
          type: "INFO",
          active: true,
          createdAt: new Date(),
        },
      ]);
      mockUserFindUnique.mockResolvedValue({
        id: "staff-1",
        name: "Staff One",
        email: "staff@example.com",
        role: "USER",
        isActive: true,
        employmentType: "PART_TIME",
        hourlyRate: 35000,
        monthlySalary: 6000000,
        birthday: new Date("2000-01-15"),
        startDate: new Date("2024-03-01"),
        luckyWheelAllowed: true,
        achievements: [],
        adjustments: [],
        payslips: [],
      });
      mockWorkShiftFindMany.mockResolvedValue([]);
      mockCheckInFindMany.mockResolvedValue([]);
      mockRequestFindMany.mockResolvedValue([]);
      mockAllowedIPFindMany.mockResolvedValue([]);

      const res = await app.request("/api/staff/home-data", {
        headers: {
          Cookie: `access_token=${authToken}`,
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      const ann1 = json.data.announcements.find((a: any) => a.id === "ann-1");
      const ann2 = json.data.announcements.find((a: any) => a.id === "ann-2");
      expect(ann1?.isRead).toBe(true);
      expect(ann2?.isRead).toBe(false);
    });
  });
});

