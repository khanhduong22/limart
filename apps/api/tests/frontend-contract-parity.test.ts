import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockUserFindUnique,
  mockUserFindFirst,
  mockUserFindMany,
  mockUserCreate,
  mockUserUpdate,
  mockUserDelete,
  mockUserCount,
  mockWorkShiftFindMany,
  mockWorkShiftFindUnique,
  mockWorkShiftCreate,
  mockWorkShiftUpdate,
  mockWorkShiftDelete,
  mockWorkShiftCount,
  mockShiftDutyFindMany,
  mockShiftDutyCreate,
  mockShiftDutyDelete,
  mockStaffTaskFindMany,
  mockStaffTaskFindUnique,
  mockStaffTaskCreate,
  mockStaffTaskUpdate,
  mockStaffTaskDelete,
  mockUserTaskFindMany,
  mockUserTaskFindUnique,
  mockUserTaskUpdate,
  mockTaskDefinitionFindMany,
  mockTaskDefinitionFindUnique,
  mockMarketplaceTaskFindMany,
  mockCheckInFindMany,
  mockCheckInFindFirst,
  mockCheckInCreate,
  mockAllowedIPFindMany,
  mockPayrollPeriodFindUnique,
  mockPayrollPeriodUpsert,
  mockPayrollPeriodUpdate,
  mockPayrollAdjustmentCreate,
  mockPayrollAdjustmentFindMany,
  mockPayslipFindUnique,
  mockPayslipFindMany,
  mockPayslipUpsert,
  mockSessionAuditLogCreate,
  mockShiftAuditLogCreate,
  mockHolidayFindMany,
  mockRequestFindMany,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockUserFindFirst: vi.fn(),
  mockUserFindMany: vi.fn(),
  mockUserCreate: vi.fn(),
  mockUserUpdate: vi.fn(),
  mockUserDelete: vi.fn(),
  mockUserCount: vi.fn(),
  mockWorkShiftFindMany: vi.fn(),
  mockWorkShiftFindUnique: vi.fn(),
  mockWorkShiftCreate: vi.fn(),
  mockWorkShiftUpdate: vi.fn(),
  mockWorkShiftDelete: vi.fn(),
  mockWorkShiftCount: vi.fn(),
  mockShiftDutyFindMany: vi.fn(),
  mockShiftDutyCreate: vi.fn(),
  mockShiftDutyDelete: vi.fn(),
  mockStaffTaskFindMany: vi.fn(),
  mockStaffTaskFindUnique: vi.fn(),
  mockStaffTaskCreate: vi.fn(),
  mockStaffTaskUpdate: vi.fn(),
  mockStaffTaskDelete: vi.fn(),
  mockUserTaskFindMany: vi.fn(),
  mockUserTaskFindUnique: vi.fn(),
  mockUserTaskUpdate: vi.fn(),
  mockTaskDefinitionFindMany: vi.fn(),
  mockTaskDefinitionFindUnique: vi.fn(),
  mockMarketplaceTaskFindMany: vi.fn(),
  mockCheckInFindMany: vi.fn(),
  mockCheckInFindFirst: vi.fn(),
  mockCheckInCreate: vi.fn(),
  mockAllowedIPFindMany: vi.fn(),
  mockPayrollPeriodFindUnique: vi.fn(),
  mockPayrollPeriodUpsert: vi.fn(),
  mockPayrollPeriodUpdate: vi.fn(),
  mockPayrollAdjustmentCreate: vi.fn(),
  mockPayrollAdjustmentFindMany: vi.fn(),
  mockPayslipFindUnique: vi.fn(),
  mockPayslipFindMany: vi.fn(),
  mockPayslipUpsert: vi.fn(),
  mockSessionAuditLogCreate: vi.fn().mockResolvedValue({ id: "audit-session-1" }),
  mockShiftAuditLogCreate: vi.fn().mockResolvedValue({ id: "audit-shift-1" }),
  mockHolidayFindMany: vi.fn(),
  mockRequestFindMany: vi.fn(),
}));

vi.mock("@checkin/db", () => ({
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
      findFirst: mockUserFindFirst,
      findMany: mockUserFindMany,
      create: mockUserCreate,
      update: mockUserUpdate,
      delete: mockUserDelete,
      count: mockUserCount,
    },
    workShift: {
      findMany: mockWorkShiftFindMany,
      findUnique: mockWorkShiftFindUnique,
      create: mockWorkShiftCreate,
      update: mockWorkShiftUpdate,
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      delete: mockWorkShiftDelete,
      count: mockWorkShiftCount,
    },
    shiftDuty: {
      findMany: mockShiftDutyFindMany,
      create: mockShiftDutyCreate,
      delete: mockShiftDutyDelete,
    },
    staffTask: {
      findMany: mockStaffTaskFindMany,
      findUnique: mockStaffTaskFindUnique,
      create: mockStaffTaskCreate,
      update: mockStaffTaskUpdate,
      delete: mockStaffTaskDelete,
    },
    userTask: {
      findMany: mockUserTaskFindMany,
      findUnique: mockUserTaskFindUnique,
      update: mockUserTaskUpdate,
      count: vi.fn().mockResolvedValue(0),
    },
    taskDefinition: {
      findMany: mockTaskDefinitionFindMany,
      findUnique: mockTaskDefinitionFindUnique,
    },
    marketplaceTask: {
      findMany: mockMarketplaceTaskFindMany,
    },
    checkIn: {
      findMany: mockCheckInFindMany,
      findFirst: mockCheckInFindFirst,
      create: mockCheckInCreate,
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    allowedIP: {
      findMany: mockAllowedIPFindMany,
    },
    payrollPeriod: {
      findUnique: mockPayrollPeriodFindUnique,
      upsert: mockPayrollPeriodUpsert,
      update: mockPayrollPeriodUpdate,
    },
    payrollAdjustment: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: mockPayrollAdjustmentFindMany,
      create: mockPayrollAdjustmentCreate,
    },
    payslip: {
      findUnique: mockPayslipFindUnique,
      findMany: mockPayslipFindMany,
      upsert: mockPayslipUpsert,
    },
    holiday: {
      findMany: mockHolidayFindMany,
    },
    request: {
      findMany: mockRequestFindMany,
      count: vi.fn().mockResolvedValue(0),
    },
    sessionAuditLog: {
      create: mockSessionAuditLogCreate,
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    shiftAuditLog: {
      create: mockShiftAuditLogCreate,
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    session: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn().mockImplementation(async (callback: any) => {
      if (typeof callback === "function") {
        return callback({
          workShift: {
            findUnique: mockWorkShiftFindUnique,
            update: mockWorkShiftUpdate,
          },
          shiftAuditLog: {
            create: mockShiftAuditLogCreate,
          },
          payrollPeriod: {
            upsert: mockPayrollPeriodUpsert,
            update: mockPayrollPeriodUpdate,
          },
          payslip: {
            upsert: mockPayslipUpsert,
          },
        });
      }
      return Promise.all(callback);
    }),
  },
}));

vi.mock("../src/lib/cache", () => ({
  invalidateCachePattern: vi.fn().mockResolvedValue(undefined),
  invalidateShiftDutyCache: vi.fn().mockResolvedValue(undefined),
  invalidatePayrollCache: vi.fn().mockResolvedValue(undefined),
  getOrSetCache: vi.fn().mockImplementation((_k, _t, fn) => fn()),
  getRedisClient: vi.fn().mockReturnValue(null),
  setRedisClient: vi.fn(),
}));

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import { _resetLocks } from "../src/lib/lock";
import { _resetRateLimits } from "../src/middleware/rate-limiter";

describe("Frontend Contract Parity & Integration Suite (TanStack Query Migration)", () => {
  let adminToken: string;
  let staffToken: string;
  let partnerToken: string;

  const mockAdminUser = {
    id: "admin-u1",
    name: "Admin User",
    email: "admin@limart.vn",
    role: "ADMIN",
    image: "/avatar-admin.png",
    isActive: true,
    employmentType: "FULL_TIME",
    hourlyRate: 50000,
    monthlySalary: 15000000,
    birthday: "1995-05-20T00:00:00.000Z",
    startDate: "2024-01-01T00:00:00.000Z",
    luckyWheelAllowed: true,
    staffTasksAllowed: true,
    achievements: [{ id: "ach-1", code: "TOP_PERFORMER", title: "Top Performer" }],
  };

  const mockStaffUser = {
    id: "staff-u1",
    name: "Staff User",
    email: "staff@limart.vn",
    role: "USER",
    image: "/avatar-staff.png",
    isActive: true,
    employmentType: "PART_TIME",
    hourlyRate: 25000,
    monthlySalary: 0,
    birthday: "2000-08-15T00:00:00.000Z",
    startDate: "2025-02-01T00:00:00.000Z",
    luckyWheelAllowed: true,
    staffTasksAllowed: true,
    achievements: [],
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    _resetLocks();
    _resetRateLimits();

    adminToken = await signAccessToken({
      sub: mockAdminUser.id,
      email: mockAdminUser.email,
      role: mockAdminUser.role,
      name: mockAdminUser.name,
    });

    staffToken = await signAccessToken({
      sub: mockStaffUser.id,
      email: mockStaffUser.email,
      role: mockStaffUser.role,
      name: mockStaffUser.name,
    });

    partnerToken = await signAccessToken({
      sub: "partner-u1",
      email: "partner@limart.vn",
      role: "PARTNER",
      name: "Partner User",
    });

    // Default DB stubs
    mockUserFindFirst.mockResolvedValue(null);
    mockAllowedIPFindMany.mockResolvedValue([{ id: "ip-1", prefix: "127.0.0.1", label: "Localhost" }]);
    mockHolidayFindMany.mockResolvedValue([]);
    mockRequestFindMany.mockResolvedValue([]);
    mockShiftDutyFindMany.mockResolvedValue([]);
    mockPayrollAdjustmentFindMany.mockResolvedValue([]);
    mockPayslipFindMany.mockResolvedValue([]);
  });

  // ==========================================================================
  // 1. DUAL-AUTH & USER IDENTITY PARITY (/api/me, /api/auth/me)
  // ==========================================================================
  describe("1. Dual-Auth & User Identity Parity (/api/me, /api/auth/me)", () => {
    it("returns 200 and user contract using Cookie authentication", async () => {
      mockUserFindUnique.mockResolvedValueOnce(mockStaffUser);

      const res = await app.request("/api/me", {
        headers: { Cookie: `access_token=${staffToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({
        success: true,
        user: expect.objectContaining({
          id: mockStaffUser.id,
          name: mockStaffUser.name,
          email: mockStaffUser.email,
          role: "USER",
          isActive: true,
          hourlyRate: 25000,
        }),
        token: staffToken,
      });
    });

    it("returns 200 and user contract using Authorization: Bearer token", async () => {
      mockUserFindUnique.mockResolvedValueOnce(mockStaffUser);

      const res = await app.request("/api/me", {
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.user.id).toBe(mockStaffUser.id);
      expect(json.token).toBe(staffToken);
    });

    it("verifies /api/auth/me returns identical contract shape as /api/me", async () => {
      mockUserFindUnique.mockResolvedValueOnce(mockAdminUser);

      const res = await app.request("/api/auth/me", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({
        success: true,
        user: expect.objectContaining({
          id: mockAdminUser.id,
          name: mockAdminUser.name,
          role: "ADMIN",
        }),
        token: adminToken,
      });
    });

    it("returns 401 { success: false, error: string } when credentials are missing", async () => {
      const res = await app.request("/api/me");
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json).toEqual({
        success: false,
        error: expect.any(String),
      });
    });

    it("returns 401 { success: false, error: string } when token is invalid or tampered", async () => {
      const res = await app.request("/api/me", {
        headers: { Authorization: "Bearer invalid.jwt.token" },
      });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json).toEqual({
        success: false,
        error: expect.any(String),
      });
    });

    it("returns 404 { success: false, error: string } when user is inactive or deleted", async () => {
      mockUserFindUnique.mockResolvedValueOnce({
        ...mockStaffUser,
        isActive: false,
      });

      const res = await app.request("/api/me", {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json).toEqual({
        success: false,
        error: expect.any(String),
      });
    });
  });

  // ==========================================================================
  // 2. SCHEDULE ENDPOINTS (/api/schedule, /api/admin/schedule, swap, take, duties)
  // ==========================================================================
  describe("2. Schedule Contract Parity (/api/schedule, /api/admin/schedule)", () => {
    it("GET /api/schedule returns shifts and date range for authenticated staff", async () => {
      const mockShifts = [
        {
          id: 101,
          userId: mockStaffUser.id,
          start: new Date("2026-10-15T08:30:00Z"),
          end: new Date("2026-10-15T12:00:00Z"),
          shiftType: "MORNING",
          status: "SCHEDULED",
          user: { id: mockStaffUser.id, name: mockStaffUser.name },
          duties: [],
        },
      ];
      mockWorkShiftFindMany.mockResolvedValueOnce(mockShifts);

      const res = await app.request("/api/schedule?month=10&year=2026", {
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data).toHaveLength(1);
      expect(json.range).toEqual({
        start: expect.any(String),
        end: expect.any(String),
      });
    });

    it("GET /api/admin/schedule returns calendar events with duty metadata for admin", async () => {
      const mockShifts = [
        {
          id: 201,
          userId: mockStaffUser.id,
          start: new Date("2026-10-16T08:30:00Z"),
          end: new Date("2026-10-16T12:00:00Z"),
          shiftType: "MORNING",
          status: "CONFIRMED",
          isSenior: false,
          isOpenForSwap: false,
          user: {
            id: mockStaffUser.id,
            name: mockStaffUser.name,
            email: mockStaffUser.email,
            employmentType: "PART_TIME",
          },
          duties: [],
        },
      ];
      mockWorkShiftFindMany.mockResolvedValueOnce(mockShifts);

      const res = await app.request("/api/admin/schedule?month=10&year=2026", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data[0]).toEqual(
        expect.objectContaining({
          id: 201,
          title: mockStaffUser.name,
          start: expect.any(String),
          end: expect.any(String),
          userId: mockStaffUser.id,
          employmentType: "PART_TIME",
          isOpenForSwap: false,
        })
      );
    });

    it("GET /api/admin/schedule returns 403 when non-admin accesses", async () => {
      const res = await app.request("/api/admin/schedule", {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json).toEqual({
        success: false,
        error: expect.stringMatching(/Forbidden|Admin/i),
      });
    });

    it("POST /api/schedule/:id/take successfully claims an available shift", async () => {
      const targetShift = {
        id: 301,
        userId: "other-user-9",
        start: new Date(Date.now() + 86400000),
        end: new Date(Date.now() + 90000000),
        isOpenForSwap: true,
        user: { id: "other-user-9", name: "Other Staff" },
      };
      mockWorkShiftFindUnique.mockResolvedValueOnce(targetShift);
      mockWorkShiftUpdate.mockResolvedValueOnce({
        ...targetShift,
        userId: mockStaffUser.id,
        isOpenForSwap: false,
      });

      const res = await app.request("/api/schedule/301/take", {
        method: "POST",
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({
        success: true,
        message: expect.any(String),
        data: expect.objectContaining({
          id: 301,
          userId: mockStaffUser.id,
          isOpenForSwap: false,
        }),
      });
    });

    it("POST /api/schedule/:id/take returns 400 when user attempts to take their own shift", async () => {
      mockWorkShiftFindUnique.mockResolvedValueOnce({
        id: 302,
        userId: mockStaffUser.id,
        start: new Date(Date.now() + 86400000),
        isOpenForSwap: true,
      });

      const res = await app.request("/api/schedule/302/take", {
        method: "POST",
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/đã là ca của bạn/i);
    });

    it("POST /api/schedule/:id/take returns 404 when shift does not exist", async () => {
      mockWorkShiftFindUnique.mockResolvedValueOnce(null);

      const res = await app.request("/api/schedule/9999/take", {
        method: "POST",
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json).toEqual({
        success: false,
        error: expect.any(String),
      });
    });

    it("POST /api/schedule/:id/swap toggles shift availability for swap", async () => {
      const shift = {
        id: 401,
        userId: mockStaffUser.id,
        start: new Date(Date.now() + 86400000 * 20),
        isOpenForSwap: false,
        user: { id: mockStaffUser.id, name: mockStaffUser.name },
      };
      mockWorkShiftFindUnique.mockResolvedValueOnce(shift);
      mockWorkShiftUpdate.mockResolvedValueOnce({ ...shift, isOpenForSwap: true });

      const res = await app.request("/api/schedule/401/swap", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${staffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isOpen: true }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.isOpenForSwap).toBe(true);
    });

    it("POST /api/schedule/:id/swap returns 403 when non-owner non-admin tries to swap", async () => {
      mockWorkShiftFindUnique.mockResolvedValueOnce({
        id: 402,
        userId: "different-user",
        start: new Date(Date.now() + 86400000 * 20),
        isOpenForSwap: false,
      });

      const res = await app.request("/api/schedule/402/swap", {
        method: "POST",
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json).toEqual({
        success: false,
        error: expect.any(String),
      });
    });

    it("GET /api/admin/schedule/:id/duties returns duties list for a shift", async () => {
      const mockDuties = [
        {
          id: "duty-1",
          shiftId: 501,
          title: "Bán hàng",
          user: { id: mockStaffUser.id, name: mockStaffUser.name },
        },
      ];
      mockShiftDutyFindMany.mockResolvedValueOnce(mockDuties);

      const res = await app.request("/api/admin/schedule/501/duties", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({
        success: true,
        data: mockDuties,
      });
    });

    it("GET /api/admin/schedule/:id/duties returns 400 for non-numeric shift id", async () => {
      const res = await app.request("/api/admin/schedule/not-a-number/duties", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/Invalid shift id/i);
    });
  });

  // ==========================================================================
  // 3. STAFF TASKS & ADMIN TASK MANAGEMENT (/api/staff-tasks, /api/admin/tasks/*)
  // ==========================================================================
  describe("3. Staff Tasks & Task Flow Contract Parity", () => {
    it("GET /api/staff-tasks returns tasks and allowed users for admin", async () => {
      mockUserFindUnique.mockResolvedValueOnce({
        id: mockAdminUser.id,
        role: "ADMIN",
        staffTasksAllowed: true,
      });
      mockStaffTaskFindMany.mockResolvedValueOnce([
        {
          id: "st-1",
          title: "Kiểm kho chiều",
          status: "TODO",
          assignee: { id: mockStaffUser.id, name: mockStaffUser.name },
        },
      ]);
      mockUserFindMany.mockResolvedValueOnce([mockStaffUser]);

      const res = await app.request("/api/staff-tasks", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual(
        expect.objectContaining({
          success: true,
          allowed: true,
          tasks: expect.any(Array),
          users: expect.any(Array),
          data: expect.objectContaining({
            tasks: expect.any(Array),
            users: expect.any(Array),
          }),
        })
      );
    });

    it("GET /api/staff-tasks returns 403 when staff lacks staffTasksAllowed", async () => {
      mockUserFindUnique.mockResolvedValueOnce({
        id: "staff-no-perm",
        role: "USER",
        staffTasksAllowed: false,
      });

      const tokenNoPerm = await signAccessToken({
        sub: "staff-no-perm",
        email: "noperm@limart.vn",
        role: "USER",
      });

      const res = await app.request("/api/staff-tasks", {
        headers: { Authorization: `Bearer ${tokenNoPerm}` },
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.allowed).toBe(false);
      expect(json.error).toMatch(/không có quyền truy cập/i);
    });

    it("GET /api/staff-tasks/stats returns KPI breakdown shape", async () => {
      mockUserFindUnique.mockResolvedValueOnce({
        id: mockStaffUser.id,
        role: "USER",
        staffTasksAllowed: true,
      });
      mockStaffTaskFindMany.mockResolvedValueOnce([
        {
          id: "st-1",
          assigneeId: mockStaffUser.id,
          status: "APPROVED",
          createdAt: new Date(),
          updatedAt: new Date(),
          deadline: new Date(Date.now() + 86400000),
        },
        {
          id: "st-2",
          assigneeId: mockStaffUser.id,
          status: "DOING",
          createdAt: new Date(),
          updatedAt: new Date(),
          deadline: new Date(Date.now() + 86400000),
        },
      ]);

      const res = await app.request("/api/staff-tasks/stats", {
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.stats[mockStaffUser.id].monthly).toEqual(
        expect.objectContaining({
          total: 2,
          approved: 1,
          doing: 1,
          pendingReview: 0,
          todo: 0,
          rejected: 0,
          completionRate: 0.5,
        })
      );
    });

    it("GET /api/staff/staff-tasks returns employee task list", async () => {
      mockUserFindUnique.mockResolvedValueOnce({
        id: mockStaffUser.id,
        role: "USER",
        staffTasksAllowed: true,
      });
      mockStaffTaskFindMany.mockResolvedValueOnce([
        { id: "st-10", title: "Soạn hàng online", status: "TODO", assigneeId: mockStaffUser.id },
      ]);

      const res = await app.request("/api/staff/staff-tasks", {
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data.tasks)).toBe(true);
      expect(json.data).toBeDefined();
    });

    it("GET /api/admin/tasks returns submitted tasks queue for admin verification", async () => {
      const mockUserTasks = [
        {
          id: "ut-1",
          userId: mockStaffUser.id,
          taskDefId: "td-1",
          status: "SUBMITTED",
          quantity: 5,
          unitPrice: 2000,
          note: "Soạn 5 đơn",
          createdAt: new Date(),
          submittedAt: new Date(),
          user: mockStaffUser,
          taskDefinition: { id: "td-1", name: "Đóng gói đơn hàng", baseReward: 2000 },
        },
      ];
      mockUserTaskFindMany.mockResolvedValueOnce(mockUserTasks);

      const res = await app.request("/api/admin/tasks", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data[0]).toEqual(
        expect.objectContaining({
          id: "ut-1",
          status: "SUBMITTED",
          quantity: 5,
        })
      );
    });

    it("POST /api/admin/tasks/:id/approve approves task and credits reward", async () => {
      const existingTask = {
        id: "ut-2",
        userId: mockStaffUser.id,
        status: "SUBMITTED",
        unitPrice: 3000,
        quantity: 2,
        createdAt: new Date(),
        submittedAt: new Date(),
        taskDefinition: { name: "Soạn hàng" },
      };
      mockUserTaskFindUnique.mockResolvedValueOnce(existingTask);
      mockUserTaskUpdate.mockResolvedValueOnce({
        ...existingTask,
        status: "APPROVED",
        bonusPenalty: 6000,
      });

      const res = await app.request("/api/admin/tasks/ut-2/approve", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ adminNote: "Làm tốt lắm" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({
        success: true,
        message: expect.any(String),
        data: expect.objectContaining({ status: "APPROVED" }),
      });
    });

    it("POST /api/admin/tasks/:id/reject rejects task with review note", async () => {
      const existingTask = {
        id: "ut-3",
        userId: mockStaffUser.id,
        status: "SUBMITTED",
        createdAt: new Date(),
        submittedAt: new Date(),
        taskDefinition: { name: "Soạn hàng" },
      };
      mockUserTaskFindUnique.mockResolvedValueOnce(existingTask);
      mockUserTaskUpdate.mockResolvedValueOnce({
        ...existingTask,
        status: "REJECTED",
        adminNote: "Thiếu ảnh bằng chứng",
      });

      const res = await app.request("/api/admin/tasks/ut-3/reject", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "Thiếu ảnh bằng chứng" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("REJECTED");
    });

    it("GET /api/admin/tasks/definitions returns available task definitions", async () => {
      const mockDefs = [
        { id: "td-1", name: "Đóng hàng", baseReward: 2000, active: true },
      ];
      mockTaskDefinitionFindMany.mockResolvedValueOnce(mockDefs);

      const res = await app.request("/api/admin/tasks/definitions", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({
        success: true,
        data: mockDefs,
      });
    });
  });

  // ==========================================================================
  // 4. CHECKINS CONTRACT PARITY (/api/checkins/today, /status, /in, /out)
  // ==========================================================================
  describe("4. Checkin Routes Contract Parity", () => {
    it("GET /api/checkins/today returns today checkin feed for user", async () => {
      const mockCheckins = [
        {
          id: "chk-1",
          userId: mockStaffUser.id,
          type: "checkin",
          timestamp: new Date().toISOString(),
          ipAddress: "127.0.0.1",
        },
      ];
      mockCheckInFindMany.mockResolvedValueOnce(mockCheckins);

      const res = await app.request("/api/checkins/today", {
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({
        success: true,
        data: mockCheckins,
      });
    });

    it("GET /api/checkins/status returns working status and latest checkin summary", async () => {
      const mockTodayCheckin = {
        id: "chk-2",
        userId: mockStaffUser.id,
        type: "checkin",
        timestamp: new Date(),
      };
      mockCheckInFindMany.mockResolvedValueOnce([mockTodayCheckin]);

      const res = await app.request("/api/checkins/status", {
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({
        success: true,
        isWorking: true,
        isCheckedIn: true,
        lastCheckin: expect.objectContaining({ id: "chk-2", type: "checkin" }),
        todayCheckins: expect.any(Array),
        data: expect.objectContaining({
          isWorking: true,
          isCheckedIn: true,
        }),
      });
    });

    it("POST /api/checkins/in records morning shift check-in", async () => {
      mockCheckInFindFirst.mockResolvedValueOnce(null); // No prior checkin
      const createdCheckin = {
        id: "chk-in-1",
        userId: mockStaffUser.id,
        type: "checkin",
        timestamp: new Date(),
        ipAddress: "127.0.0.1",
      };
      mockCheckInCreate.mockResolvedValueOnce(createdCheckin);

      const res = await app.request("/api/checkins/in", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${staffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ note: "Vào ca đúng giờ" }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json).toEqual(
        expect.objectContaining({
          success: true,
          message: expect.stringMatching(/Chấm công vào ca thành công/i),
          data: expect.objectContaining({ id: "chk-in-1", type: "checkin" }),
          clientIP: expect.any(String),
        })
      );
    });

    it("POST /api/checkins/out returns 400 when staff has not checked in", async () => {
      mockCheckInFindFirst.mockResolvedValueOnce(null); // No previous checkin

      const res = await app.request("/api/checkins/out", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${staffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json).toEqual({
        success: false,
        error: "Bạn chưa Check-in, không thể Check-out!",
      });
    });

    it("POST /api/checkins returns 400 when consecutive check-in is attempted without check-out", async () => {
      // Last record was already a checkin
      mockCheckInFindFirst.mockResolvedValueOnce({
        id: "last-chk-1",
        userId: mockStaffUser.id,
        type: "checkin",
        timestamp: new Date(Date.now() - 3600000), // 1 hour ago
      });

      const res = await app.request("/api/checkins", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${staffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: "checkin" }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/chưa Check-out/i);
    });
  });

  // ==========================================================================
  // 5. ADMIN EMPLOYEES, ADJUSTMENTS & PAYROLL (/api/admin/employees, /adjustments, /payroll/*)
  // ==========================================================================
  describe("5. Admin Operations Contract Parity", () => {
    it("GET /api/admin/employees returns list of store staff with wage profiles", async () => {
      mockUserFindMany.mockResolvedValueOnce([mockAdminUser, mockStaffUser]);

      const res = await app.request("/api/admin/employees", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data[0]).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          name: expect.any(String),
          email: expect.any(String),
          role: expect.any(String),
          isActive: expect.any(Boolean),
          hourlyRate: expect.any(Number),
        })
      );
    });

    it("POST /api/admin/adjustments records salary bonus/penalty adjustment", async () => {
      const mockAdj = {
        id: "adj-1",
        userId: mockStaffUser.id,
        amount: 50000,
        reason: "Thưởng hỗ trợ ca gấp",
      };
      mockPayrollAdjustmentCreate.mockResolvedValueOnce(mockAdj);

      const res = await app.request("/api/admin/adjustments", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: mockStaffUser.id,
          amount: 50000,
          reason: "Thưởng hỗ trợ ca gấp",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({
        success: true,
        message: "Đã lưu điều chỉnh thành công",
        data: mockAdj,
      });
    });

    it("POST /api/admin/adjustments returns 400 when missing required fields", async () => {
      const res = await app.request("/api/admin/adjustments", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: mockStaffUser.id }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json).toEqual({
        success: false,
        error: "userId, amount and reason are required",
      });
    });

    it("GET /api/admin/payroll returns computed monthly payroll table", async () => {
      mockUserFindMany.mockResolvedValueOnce([
        {
          id: mockStaffUser.id,
          name: mockStaffUser.name,
          email: mockStaffUser.email,
          role: mockStaffUser.role,
          hourlyRate: 25000,
          monthlySalary: 0,
          employmentType: "PART_TIME",
          adjustments: [],
        },
      ]);
      mockPayrollPeriodFindUnique.mockResolvedValueOnce(null);

      const res = await app.request("/api/admin/payroll?month=10&year=2026", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual(
        expect.objectContaining({
          success: true,
          data: expect.any(Array),
          isClosed: false,
          bonusPercent: expect.any(Number),
          bonusTargets: expect.any(Array),
          excludedBonusUsers: expect.any(Array),
        })
      );
      expect(json.data[0]).toEqual(
        expect.objectContaining({
          id: mockStaffUser.id,
          name: mockStaffUser.name,
          month: 10,
          year: 2026,
          hourlyRate: 25000,
        })
      );
    });

    it("GET /api/admin/payroll/:userId returns individual employee payslip breakdown", async () => {
      mockUserFindUnique.mockResolvedValueOnce(mockStaffUser);
      mockPayrollPeriodFindUnique.mockResolvedValueOnce(null);
      mockPayslipFindUnique.mockResolvedValueOnce(null);

      const res = await app.request(`/api/admin/payroll/${mockStaffUser.id}?month=10&year=2026`, {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toEqual(
        expect.objectContaining({
          user: expect.objectContaining({ id: mockStaffUser.id }),
          isClosed: false,
          stats: expect.any(Object),
        })
      );
    });

    it("GET /api/admin/payroll/:userId returns 404 when employee is not found", async () => {
      mockUserFindUnique.mockResolvedValueOnce(null);

      const res = await app.request("/api/admin/payroll/unknown-user-id", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json).toEqual({
        success: false,
        error: "Không tìm thấy nhân viên",
      });
    });

    it("POST /api/admin/payroll/bonus configures monthly bonus percentage", async () => {
      mockPayrollPeriodUpsert.mockResolvedValueOnce({
        month: 10,
        year: 2026,
        bonusPercent: 10,
        bonusTargets: ["PART_TIME"],
        excludedBonusUsers: [],
      });

      const res = await app.request("/api/admin/payroll/bonus", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          month: 10,
          year: 2026,
          bonusPercent: 10,
          targets: ["PART_TIME"],
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual(
        expect.objectContaining({
          success: true,
          message: "Đã cập nhật cấu hình thưởng tháng",
          data: expect.objectContaining({ bonusPercent: 10 }),
        })
      );
    });

    it("POST /api/admin/payroll/close locks payroll period and creates payslip snapshots", async () => {
      mockUserFindMany.mockResolvedValueOnce([]); // No users needing calculation in mock
      mockPayrollPeriodUpsert.mockResolvedValueOnce({
        month: 10,
        year: 2026,
        status: "CLOSED",
      });

      const res = await app.request("/api/admin/payroll/close", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ month: 10, year: 2026 }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual(
        expect.objectContaining({
          success: true,
          message: expect.stringMatching(/chốt/i),
          payslipsCount: expect.any(Number),
        })
      );
    });

    it("POST /api/admin/payroll/reopen unlocks payroll period for editing", async () => {
      mockPayrollPeriodUpdate.mockResolvedValueOnce({
        month: 10,
        year: 2026,
        status: "OPEN",
      });

      const res = await app.request("/api/admin/payroll/reopen", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ month: 10, year: 2026 }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({
        success: true,
        message: "Đã mở lại sổ tính lương!",
        data: expect.objectContaining({ status: "OPEN" }),
      });
    });
  });

  // ==========================================================================
  // 6. UNIFIED ERROR CONTRACT PARITY ACROSS ALL MODULES
  // ==========================================================================
  describe("6. Unified Error Contract Standards ({ success: false, error: string })", () => {
    it("asserts 400 Bad Request strictly adheres to { success: false, error: string }", async () => {
      const res = await app.request("/api/admin/adjustments", {
        method: "POST",
        headers: { Cookie: `access_token=${adminToken}` },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(typeof json.error).toBe("string");
      expect(json.error.length).toBeGreaterThan(0);
    });

    it("asserts 401 Unauthorized strictly adheres to { success: false, error: string }", async () => {
      const res = await app.request("/api/schedule/my-shifts");
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(typeof json.error).toBe("string");
    });

    it("asserts 403 Forbidden strictly adheres to { success: false, error: string }", async () => {
      const res = await app.request("/api/admin/employees", {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(typeof json.error).toBe("string");
    });

    it("asserts 404 Not Found strictly adheres to { success: false, error: string }", async () => {
      const res = await app.request("/api/non-existent-route-for-testing");
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json).toEqual({
        success: false,
        error: "Route not found",
      });
    });
  });
});
