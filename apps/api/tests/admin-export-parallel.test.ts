import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";
import * as XLSX from "xlsx";

const {
  mockUserFindMany,
  mockUserFindUnique,
  mockCheckInFindMany,
  mockWorkShiftFindMany,
  mockRequestFindMany,
  mockPayrollPeriodUpsert,
  mockPayrollPeriodUpdate,
  mockPayrollPeriodFindUnique,
  mockSessionAuditLogCreate,
} = vi.hoisted(() => ({
  mockUserFindMany: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockCheckInFindMany: vi.fn(),
  mockWorkShiftFindMany: vi.fn(),
  mockRequestFindMany: vi.fn(),
  mockPayrollPeriodUpsert: vi.fn(),
  mockPayrollPeriodUpdate: vi.fn(),
  mockPayrollPeriodFindUnique: vi.fn(),
  mockSessionAuditLogCreate: vi.fn().mockResolvedValue({ id: "audit-log-1" }),
}));

vi.mock("@checkin/db", () => {
  const prismaMock = {
    user: {
      findMany: mockUserFindMany,
      findUnique: mockUserFindUnique,
      count: vi.fn().mockResolvedValue(10),
    },
    checkIn: {
      findMany: mockCheckInFindMany,
    },
    workShift: {
      findMany: mockWorkShiftFindMany,
    },
    request: {
      findMany: mockRequestFindMany,
    },
    payrollPeriod: {
      upsert: mockPayrollPeriodUpsert,
      update: mockPayrollPeriodUpdate,
      findUnique: mockPayrollPeriodFindUnique,
    },
    sessionAuditLog: {
      create: mockSessionAuditLogCreate,
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    session: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
  };
  return { prisma: prismaMock };
});

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import { setRedisClient, inFlightPromises } from "../src/lib/cache";
import { _resetLocks } from "../src/lib/lock";
import { _resetRateLimits } from "../src/middleware/rate-limiter";

describe("Admin Parallelized Export & Payroll Invalidation Suite", () => {
  let adminToken: string;
  let staffToken: string;
  let memoryStore: Map<string, string>;
  let mockRedis: any;

  const mockAdminUser = {
    id: "admin-user-id",
    name: "Admin Manager",
    email: "admin@limart.vn",
    role: "ADMIN",
    isActive: true,
  };

  const mockStaffUser = {
    id: "staff-user-id",
    name: "Staff Employee",
    email: "staff@limart.vn",
    role: "USER",
    isActive: true,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    inFlightPromises.clear();
    _resetLocks();
    _resetRateLimits();

    memoryStore = new Map<string, string>();

    // Mock Redis client with Valkey scanStream and del pipeline support
    mockRedis = {
      status: "ready",
      ping: vi.fn().mockResolvedValue("PONG"),
      get: vi.fn(async (key: string) => memoryStore.get(key) || null),
      setex: vi.fn(async (key: string, _ttl: number, value: string) => {
        memoryStore.set(key, value);
        return "OK";
      }),
      del: vi.fn(async (...keys: string[]) => {
        let deleted = 0;
        for (const k of keys) {
          if (memoryStore.delete(k)) deleted++;
        }
        return deleted;
      }),
      keys: vi.fn(async (pattern: string) => {
        const regexStr = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
        const regex = new RegExp(`^${regexStr}$`);
        const matched: string[] = [];
        for (const k of memoryStore.keys()) {
          if (regex.test(k)) matched.push(k);
        }
        return matched;
      }),
      scanStream: vi.fn((options: { match: string; count?: number }) => {
        const emitter = new EventEmitter();
        const pattern = options.match;
        const regexStr = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
        const regex = new RegExp(`^${regexStr}$`);
        const matched: string[] = [];
        for (const k of memoryStore.keys()) {
          if (regex.test(k)) matched.push(k);
        }
        process.nextTick(() => {
          if (matched.length > 0) {
            emitter.emit("data", matched);
          }
          emitter.emit("end");
        });
        return emitter;
      }),
      pipeline: vi.fn(() => {
        const operations: Array<() => void> = [];
        const pipeObj = {
          del: vi.fn((...keys: string[]) => {
            operations.push(() => {
              for (const k of keys) {
                memoryStore.delete(k);
              }
            });
            return pipeObj;
          }),
          exec: vi.fn(async () => {
            for (const op of operations) op();
            return [];
          }),
        };
        return pipeObj;
      }),
    };

    setRedisClient(mockRedis);

    mockUserFindUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === mockAdminUser.id || where.email === mockAdminUser.email) {
        return mockAdminUser;
      }
      if (where.id === mockStaffUser.id || where.email === mockStaffUser.email) {
        return mockStaffUser;
      }
      return null;
    });

    adminToken = await signAccessToken({
      sub: mockAdminUser.id,
      email: mockAdminUser.email,
      role: "ADMIN",
    });

    staffToken = await signAccessToken({
      sub: mockStaffUser.id,
      email: mockStaffUser.email,
      role: "USER",
    });
  });

  describe("GET /api/admin/export - Parallelized Data Export", () => {
    it("should reject unauthenticated request with 401", async () => {
      const res = await app.request("/api/admin/export");
      expect(res.status).toBe(401);
    });

    it("should reject non-admin user with 403", async () => {
      const res = await app.request("/api/admin/export", {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      expect(res.status).toBe(403);
    });

    it("should execute all 4 database queries concurrently via Promise.all and generate XLSX", async () => {
      let userStarted = false;
      let userFinished = false;
      let checkinStartedWhileUserInFlight = false;
      let shiftStartedWhileUserInFlight = false;
      let requestStartedWhileUserInFlight = false;

      mockUserFindMany.mockImplementation(async () => {
        userStarted = true;
        await new Promise((r) => setTimeout(r, 15));
        userFinished = true;
        return [
          {
            id: "u-1",
            name: "Nguyễn Văn A",
            email: "nva@limart.vn",
            role: "USER",
            employmentType: "PART_TIME",
            hourlyRate: 25000,
            isActive: true,
          },
          {
            id: "u-2",
            name: "Trần Thị B",
            email: "ttb@limart.vn",
            role: "USER",
            employmentType: "FULL_TIME",
            hourlyRate: 35000,
            isActive: false,
          },
        ];
      });

      mockCheckInFindMany.mockImplementation(async () => {
        if (userStarted && !userFinished) {
          checkinStartedWhileUserInFlight = true;
        }
        return [
          {
            id: "ck-1",
            type: "CHECK_IN",
            timestamp: new Date("2026-10-10T08:00:00Z"),
            ipAddress: "14.161.1.2",
            note: "Ca sáng",
            user: { name: "Nguyễn Văn A", email: "nva@limart.vn" },
          },
        ];
      });

      mockWorkShiftFindMany.mockImplementation(async () => {
        if (userStarted && !userFinished) {
          shiftStartedWhileUserInFlight = true;
        }
        return [
          {
            id: "s-1",
            start: new Date("2026-10-10T08:00:00Z"),
            end: new Date("2026-10-10T12:00:00Z"),
            status: "APPROVED",
            createdAt: new Date("2026-10-09T10:00:00Z"),
            user: { name: "Nguyễn Văn A", email: "nva@limart.vn" },
          },
        ];
      });

      mockRequestFindMany.mockImplementation(async () => {
        if (userStarted && !userFinished) {
          requestStartedWhileUserInFlight = true;
        }
        return [
          {
            id: "req-1",
            type: "LEAVE",
            status: "APPROVED",
            reason: "Nghỉ ốm",
            createdAt: new Date("2026-10-08T09:00:00Z"),
            user: { name: "Trần Thị B", email: "ttb@limart.vn" },
          },
        ];
      });

      const res = await app.request("/api/admin/export", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="backup_data_.*\.xlsx"/);

      // Verify all queries were initiated concurrently while user query was in flight
      expect(checkinStartedWhileUserInFlight).toBe(true);
      expect(shiftStartedWhileUserInFlight).toBe(true);
      expect(requestStartedWhileUserInFlight).toBe(true);

      // Parse the generated XLSX buffer to verify content integrity
      const arrayBuffer = await res.arrayBuffer();
      const workbook = XLSX.read(Buffer.from(arrayBuffer), { type: "buffer" });
      expect(workbook.SheetNames).toEqual(["Users", "CheckIns", "WorkShifts", "Requests"]);

      const usersSheet = XLSX.utils.sheet_to_json(workbook.Sheets["Users"]);
      expect(usersSheet).toHaveLength(2);
      expect(usersSheet[0]).toMatchObject({
        ID: "u-1",
        Name: "Nguyễn Văn A",
        Active: "Đang làm việc",
      });
      expect(usersSheet[1]).toMatchObject({
        ID: "u-2",
        Name: "Trần Thị B",
        Active: "Đã nghỉ việc",
      });

      const checkinsSheet = XLSX.utils.sheet_to_json(workbook.Sheets["CheckIns"]);
      expect(checkinsSheet).toHaveLength(1);
      expect(checkinsSheet[0]).toMatchObject({
        ID: "ck-1",
        User: "Nguyễn Văn A",
        Type: "CHECK_IN",
      });

      const shiftsSheet = XLSX.utils.sheet_to_json(workbook.Sheets["WorkShifts"]);
      expect(shiftsSheet).toHaveLength(1);
      expect(shiftsSheet[0]).toMatchObject({
        ID: "s-1",
        User: "Nguyễn Văn A",
        Duration_Hours: 4,
      });

      const requestsSheet = XLSX.utils.sheet_to_json(workbook.Sheets["Requests"]);
      expect(requestsSheet).toHaveLength(1);
      expect(requestsSheet[0]).toMatchObject({
        ID: "req-1",
        User: "Trần Thị B",
        Reason: "Nghỉ ốm",
      });
    });

    it("should pass date filters to checkin, shift, and request queries while fetching users in parallel", async () => {
      mockUserFindMany.mockResolvedValue([]);
      mockCheckInFindMany.mockResolvedValue([]);
      mockWorkShiftFindMany.mockResolvedValue([]);
      mockRequestFindMany.mockResolvedValue([]);

      const from = "2026-10-01";
      const to = "2026-10-31";

      const res = await app.request(`/api/admin/export?from=${from}&to=${to}`, {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);

      const expectedDateFilter = {
        gte: new Date("2026-10-01T00:00:00.000Z"),
        lte: new Date("2026-10-31T23:59:59.999Z"),
      };

      expect(mockUserFindMany).toHaveBeenCalledWith({ orderBy: { name: "asc" } });
      expect(mockCheckInFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { timestamp: expectedDateFilter },
          include: { user: true },
          orderBy: { timestamp: "desc" },
        })
      );
      expect(mockWorkShiftFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { start: expectedDateFilter },
          include: { user: true },
          orderBy: { start: "desc" },
        })
      );
      expect(mockRequestFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { createdAt: expectedDateFilter },
          include: { user: true },
          orderBy: { createdAt: "desc" },
        })
      );
    });

    it("should return 500 when one of the parallel database queries fails", async () => {
      mockUserFindMany.mockResolvedValue([]);
      mockCheckInFindMany.mockRejectedValue(new Error("Database connection timed out"));
      mockWorkShiftFindMany.mockResolvedValue([]);
      mockRequestFindMany.mockResolvedValue([]);

      const res = await app.request("/api/admin/export", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json).toEqual({
        success: false,
        error: "Database connection timed out",
      });
    });
  });

  describe("POST /api/admin/payroll/bonus - Invalidation Suite", () => {
    it("should reject 400 when month or year is missing", async () => {
      const res = await app.request("/api/admin/payroll/bonus", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ bonusPercent: 10 }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("month and year are required");
    });

    it("should update payroll period bonus and invalidate all related caches in parallel", async () => {
      // Seed cache keys covering payroll, stats, admin dashboard, and staff payroll
      memoryStore.set("payroll:2026:10", JSON.stringify({ id: "p1" }));
      memoryStore.set("admin:payroll:2026:10", JSON.stringify({ id: "p2" }));
      memoryStore.set("admin:payroll-user:u-1:2026:10", JSON.stringify({ id: "p3" }));
      memoryStore.set("admin:employee-detail:u-1", JSON.stringify({ id: "p4" }));
      memoryStore.set("staff:payroll:u-1:2026:10", JSON.stringify({ id: "p5" }));
      memoryStore.set("stats:2026:10", JSON.stringify({ id: "p6" }));
      memoryStore.set("stats:monthly:2026:10", JSON.stringify({ id: "p7" }));
      memoryStore.set("admin:dashboard:2026-10-14", JSON.stringify({ id: "p8" }));
      memoryStore.set("admin:reports:2026:10", JSON.stringify({ id: "p9" }));
      memoryStore.set("unrelated:cache:key", "keep-me");

      mockPayrollPeriodUpsert.mockResolvedValue({
        id: "period-1",
        month: 10,
        year: 2026,
        bonusPercent: 15,
        bonusTargets: ["PART_TIME"],
        excludedBonusUsers: ["u-99"],
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
          bonusPercent: 15,
          targets: ["PART_TIME"],
          excludedBonusUsers: ["u-99"],
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.bonusPercent).toBe(15);

      expect(mockPayrollPeriodUpsert).toHaveBeenCalledWith({
        where: { month_year: { month: 10, year: 2026 } },
        create: {
          month: 10,
          year: 2026,
          bonusPercent: 15,
          bonusTargets: ["PART_TIME"],
          excludedBonusUsers: ["u-99"],
        },
        update: {
          bonusPercent: 15,
          bonusTargets: ["PART_TIME"],
          excludedBonusUsers: ["u-99"],
        },
      });

      // Verify that all payroll and dashboard caches were wiped clean
      expect(memoryStore.has("payroll:2026:10")).toBe(false);
      expect(memoryStore.has("admin:payroll:2026:10")).toBe(false);
      expect(memoryStore.has("admin:payroll-user:u-1:2026:10")).toBe(false);
      expect(memoryStore.has("admin:employee-detail:u-1")).toBe(false);
      expect(memoryStore.has("staff:payroll:u-1:2026:10")).toBe(false);
      expect(memoryStore.has("stats:2026:10")).toBe(false);
      expect(memoryStore.has("stats:monthly:2026:10")).toBe(false);
      expect(memoryStore.has("admin:dashboard:2026-10-14")).toBe(false);
      expect(memoryStore.has("admin:reports:2026:10")).toBe(false);

      // Verify unrelated key was preserved
      expect(memoryStore.get("unrelated:cache:key")).toBe("keep-me");
    });
  });

  describe("POST /api/admin/payroll/reopen - Invalidation Suite", () => {
    it("should reject 400 when month or year is missing", async () => {
      const res = await app.request("/api/admin/payroll/reopen", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ month: 10 }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("month and year are required");
    });

    it("should update payroll period to OPEN and invalidate all related caches in parallel", async () => {
      // Seed cache keys covering payroll, stats, admin dashboard, and staff payroll
      memoryStore.set("payroll:2026:10", JSON.stringify({ id: "p1" }));
      memoryStore.set("admin:payroll:2026:10", JSON.stringify({ id: "p2" }));
      memoryStore.set("staff:payroll:u-2:2026:10", JSON.stringify({ id: "p5" }));
      memoryStore.set("stats:2026:10", JSON.stringify({ id: "p6" }));
      memoryStore.set("stats:monthly:2026:10", JSON.stringify({ id: "p7" }));
      memoryStore.set("admin:dashboard:2026-10-14", JSON.stringify({ id: "p8" }));
      memoryStore.set("unrelated:cache:key2", "preserve-me");

      mockPayrollPeriodUpdate.mockResolvedValue({
        id: "period-1",
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
      expect(json.success).toBe(true);
      expect(json.message).toBe("Đã mở lại sổ tính lương!");
      expect(json.data.status).toBe("OPEN");

      expect(mockPayrollPeriodUpdate).toHaveBeenCalledWith({
        where: { month_year: { month: 10, year: 2026 } },
        data: { status: "OPEN" },
      });

      // Verify that all payroll and dashboard caches were wiped clean
      expect(memoryStore.has("payroll:2026:10")).toBe(false);
      expect(memoryStore.has("admin:payroll:2026:10")).toBe(false);
      expect(memoryStore.has("staff:payroll:u-2:2026:10")).toBe(false);
      expect(memoryStore.has("stats:2026:10")).toBe(false);
      expect(memoryStore.has("stats:monthly:2026:10")).toBe(false);
      expect(memoryStore.has("admin:dashboard:2026-10-14")).toBe(false);

      // Verify unrelated key was preserved
      expect(memoryStore.get("unrelated:cache:key2")).toBe("preserve-me");
    });
  });
});
