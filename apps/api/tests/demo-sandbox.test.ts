import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockUserCount,
  mockUserFindUnique,
  mockUserFindFirst,
  mockUserFindMany,
  mockUserCreate,
  mockUserDeleteMany,
  mockAllowedIPFindMany,
  mockAllowedIPCreate,
  mockAllowedIPDeleteMany,
  mockPayslipCreate,
  mockWorkShiftCreate,
  mockCheckInCreate,
} = vi.hoisted(() => ({
  mockUserCount: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserFindFirst: vi.fn(),
  mockUserFindMany: vi.fn(),
  mockUserCreate: vi.fn(),
  mockUserDeleteMany: vi.fn(),
  mockAllowedIPFindMany: vi.fn(),
  mockAllowedIPCreate: vi.fn(),
  mockAllowedIPDeleteMany: vi.fn(),
  mockPayslipCreate: vi.fn(),
  mockWorkShiftCreate: vi.fn(),
  mockCheckInCreate: vi.fn(),
}));

vi.mock("@checkin/db", () => ({
  PrismaClient: class MockPrismaClient {
    $disconnect = vi.fn().mockResolvedValue(undefined);
  },
  prisma: {
    user: {
      count: mockUserCount,
      findUnique: mockUserFindUnique,
      findFirst: mockUserFindFirst,
      findMany: mockUserFindMany,
      create: mockUserCreate,
      deleteMany: mockUserDeleteMany,
    },
    allowedIP: {
      findMany: mockAllowedIPFindMany,
      create: mockAllowedIPCreate,
      deleteMany: mockAllowedIPDeleteMany,
    },
    holiday: { create: vi.fn().mockResolvedValue({}), deleteMany: vi.fn().mockResolvedValue({}) },
    taskDefinition: { create: vi.fn().mockResolvedValue({}), deleteMany: vi.fn().mockResolvedValue({}) },
    taskItem: { create: vi.fn().mockResolvedValue({}), deleteMany: vi.fn().mockResolvedValue({}) },
    userTask: { create: vi.fn().mockResolvedValue({}), deleteMany: vi.fn().mockResolvedValue({}) },
    luckyWheelPrize: { create: vi.fn().mockResolvedValue({}), deleteMany: vi.fn().mockResolvedValue({}) },
    luckyWheelHistory: { create: vi.fn().mockResolvedValue({}), deleteMany: vi.fn().mockResolvedValue({}) },
    userAchievement: { create: vi.fn().mockResolvedValue({}), deleteMany: vi.fn().mockResolvedValue({}) },
    workShift: {
      create: mockWorkShiftCreate,
      deleteMany: vi.fn().mockResolvedValue({}),
    },
    checkIn: {
      create: mockCheckInCreate,
      deleteMany: vi.fn().mockResolvedValue({}),
    },
    shiftDuty: { create: vi.fn().mockResolvedValue({}), deleteMany: vi.fn().mockResolvedValue({}) },
    shiftAuditLog: { deleteMany: vi.fn().mockResolvedValue({}) },
    managerTask: {
      create: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({}),
    },
    staffTask: { create: vi.fn().mockResolvedValue({}), deleteMany: vi.fn().mockResolvedValue({}) },
    managerChecklistTask: { create: vi.fn().mockResolvedValue({}), deleteMany: vi.fn().mockResolvedValue({}) },
    managerChecklistCompletion: { create: vi.fn().mockResolvedValue({}), deleteMany: vi.fn().mockResolvedValue({}) },
    managerWeeklyTask: { create: vi.fn().mockResolvedValue({}), deleteMany: vi.fn().mockResolvedValue({}) },
    announcement: { create: vi.fn().mockResolvedValue({}), deleteMany: vi.fn().mockResolvedValue({}) },
    announcementRead: { deleteMany: vi.fn().mockResolvedValue({}) },
    stickyNote: { deleteMany: vi.fn().mockResolvedValue({}) },
    document: { create: vi.fn().mockResolvedValue({}), deleteMany: vi.fn().mockResolvedValue({}) },
    documentChunk: { deleteMany: vi.fn().mockResolvedValue({}) },
    request: { create: vi.fn().mockResolvedValue({}), deleteMany: vi.fn().mockResolvedValue({}) },
    payrollPeriod: { create: vi.fn().mockResolvedValue({}), deleteMany: vi.fn().mockResolvedValue({}) },
    payrollAdjustment: { create: vi.fn().mockResolvedValue({}), deleteMany: vi.fn().mockResolvedValue({}) },
    payslip: {
      create: mockPayslipCreate,
      deleteMany: vi.fn().mockResolvedValue({}),
    },
    sessionAuditLog: { deleteMany: vi.fn().mockResolvedValue({}) },
    session: { deleteMany: vi.fn().mockResolvedValue({}) },
    account: { deleteMany: vi.fn().mockResolvedValue({}) },
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

import { app } from "../src/app";
import {
  _resetDemoModulesMemory,
  DEMO_STAFF_NAMES,
  FULL_TIME_SALARIES,
  PART_TIME_RATES,
  sanitizePayslipRecord,
  sanitizeText,
  seedAndSanitizeDemoDatabase,
} from "../src/lib/demo-sandbox";
import { verifyAccessToken } from "../src/lib/auth";

describe("Demo Sandbox Sanitizer, Cloning Engine & /api/demo/* Endpoints", () => {
  const originalDemoMode = process.env.DEMO_SANDBOX_MODE;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDbUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetDemoModulesMemory();
    process.env.DEMO_SANDBOX_MODE = "false";
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "postgresql://postgres:pass@localhost:5432/checkin_demo_db";

    mockWorkShiftCreate.mockImplementation(async ({ data }) => ({ id: Math.floor(Math.random() * 10000) + 1, ...data }));
    mockCheckInCreate.mockImplementation(async ({ data }) => ({ id: Math.floor(Math.random() * 10000) + 1, ...data }));
    mockPayslipCreate.mockImplementation(async ({ data }) => ({ id: "ps-1", ...data }));
    mockUserCreate.mockImplementation(async ({ data }) => data);
    mockAllowedIPCreate.mockImplementation(async ({ data }) => ({ id: 1, ...data }));
  });

  afterEach(() => {
    process.env.DEMO_SANDBOX_MODE = originalDemoMode;
    process.env.NODE_ENV = originalNodeEnv;
    process.env.DATABASE_URL = originalDbUrl;
  });

  describe("sanitizeText & sanitizePayslipRecord", () => {
    it("scrubs LimArt brand, emails, phone numbers, URLs, and mapped employee names", () => {
      const nameMap = new Map<string, string>([
        ["Mai Thị Na", "Nguyễn Minh Khôi"],
        ["Trần Văn Phúc Khánh", "Trần Bảo Ngọc"],
      ]);

      const raw =
        "Cửa hàng LimArt (lim art) của chị Mai Thị Na - SĐT 0987654321, email maithina4040@gmail.com, ảnh bằng chứng https://drive.google.com/file/d/abc123/view của Trần Văn Phúc Khánh";

      const cleaned = sanitizeText(raw, nameMap);

      expect(cleaned).not.toContain("LimArt");
      expect(cleaned).not.toContain("lim art");
      expect(cleaned).toContain("Cửa hàng DemoMart (DemoMart)");
      expect(cleaned).not.toContain("Mai Thị Na");
      expect(cleaned).toContain("Nguyễn Minh Khôi");
      expect(cleaned).not.toContain("Trần Văn Phúc Khánh");
      expect(cleaned).toContain("Trần Bảo Ngọc");
      expect(cleaned).not.toContain("0987654321");
      expect(cleaned).toContain("0901234567");
      expect(cleaned).not.toContain("maithina4040@gmail.com");
      expect(cleaned).toContain("contact@demomart.vn");
      expect(cleaned).not.toContain("drive.google.com");
      expect(cleaned).toContain("https://limart2.khanhdp.com/icons/capy_dashboard.webp");
    });

    it("completely rewrites Payslip.content and netSalary so zero real names or real salaries remain", () => {
      const nameMap = new Map<string, string>([["Nguyễn Văn Thật", "Lê Hoàng Nam"]]);
      const rawPayslip = {
        userId: "u-real-1",
        month: 10,
        year: 2026,
        netSalary: 19876543,
        content: {
          userId: "u-real-1",
          name: "Nguyễn Văn Thật",
          userName: "Nguyễn Văn Thật",
          email: "realstaff@gmail.com",
          hourlyRate: 47500,
          monthlySalary: 19876543,
          baseSalary: 18500000,
          totalSalary: 19876543,
          adjustments: [
            {
              id: "adj-real-1",
              amount: 1376543,
              reason: "Thưởng riêng cho Nguyễn Văn Thật tại LimArt SĐT 0912345678",
              date: "2026-10-05T00:00:00.000Z",
            },
          ],
          dailyDetails: [
            {
              date: "2026-10-01",
              hours: 8,
              salary: 380000,
              multiplier: 1,
              isLate: false,
              isValid: true,
              shift: "Ca Sáng LimArt - Nguyễn Văn Thật",
            },
          ],
        },
      };

      const demoUser = {
        id: "u-real-1",
        name: "Lê Hoàng Nam",
        email: "nv01@demomart.vn",
        role: "USER",
        employmentType: "PART_TIME" as const,
        hourlyRate: 25000,
        monthlySalary: 0,
      };

      const { content, netSalary } = sanitizePayslipRecord(rawPayslip, demoUser, nameMap);
      const serialized = JSON.stringify(content);

      expect(serialized).not.toContain("Nguyễn Văn Thật");
      expect(serialized).not.toContain("realstaff@gmail.com");
      expect(serialized).not.toContain("19876543");
      expect(serialized).not.toContain("1376543");
      expect(serialized).not.toContain("47500");
      expect(serialized).not.toContain("380000");
      expect(serialized).not.toContain("0912345678");
      expect(content.name).toBe("Lê Hoàng Nam");
      expect(content.email).toBe("nv01@demomart.vn");
      expect(content.hourlyRate).toBe(25000);
      expect(content.dailyDetails[0].salary).toBe(8 * 25000);
      expect(content.dailyDetails[0].shift).toContain("DemoMart");
      expect(netSalary).toBe(content.finalNet);
      expect(netSalary).not.toBe(19876543);
    });
  });

  describe("seedAndSanitizeDemoDatabase Safety Locks & Cloning", () => {
    it("throws error when DEMO_SANDBOX_MODE is not enabled", async () => {
      process.env.DEMO_SANDBOX_MODE = "false";
      await expect(seedAndSanitizeDemoDatabase()).rejects.toThrow(
        "DEMO_SANDBOX_MODE is not enabled"
      );
    });

    it("throws SAFETY LOCK error when NODE_ENV !== test and DATABASE_URL is not checkin_demo_db", async () => {
      process.env.DEMO_SANDBOX_MODE = "true";
      process.env.NODE_ENV = "production";
      process.env.DATABASE_URL = "postgresql://postgres:secret@limart-db:5432/checkin_db";

      await expect(seedAndSanitizeDemoDatabase({ force: true })).rejects.toThrow(
        "SAFETY LOCK: Refusing to run demo sanitizer on non-demo database!"
      );
    });

    it("skips seeding on startup when force is false and demo DB already has >= 3 users including owner@demomart.vn", async () => {
      process.env.DEMO_SANDBOX_MODE = "true";
      mockUserCount.mockResolvedValue(8);
      mockUserFindUnique.mockResolvedValue({ id: "u-admin", email: "owner@demomart.vn" });

      const res = await seedAndSanitizeDemoDatabase({ force: false });
      expect(res.skipped).toBe(true);
      expect(mockUserDeleteMany).not.toHaveBeenCalled();
    });

    it("clones and anonymizes source database records with randomized salaries and public AllowedIPs", async () => {
      process.env.DEMO_SANDBOX_MODE = "true";

      const mockSourcePrisma = {
        user: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "src-admin",
              name: "Chủ Shop Thật",
              email: "realowner@gmail.com",
              role: "ADMIN",
              employmentType: "FULL_TIME",
              hourlyRate: 0,
              monthlySalary: 30000000,
              isActive: true,
            },
            {
              id: "src-staff-pt",
              name: "Nhân Viên Thật A",
              email: "reala@gmail.com",
              role: "USER",
              employmentType: "PART_TIME",
              hourlyRate: 21500,
              monthlySalary: 0,
              isActive: true,
            },
            {
              id: "src-staff-ft",
              name: "Nhân Viên Thật B",
              email: "realb@gmail.com",
              role: "USER",
              employmentType: "FULL_TIME",
              hourlyRate: 0,
              monthlySalary: 11234567,
              isActive: true,
            },
          ]),
        },
        payslip: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "ps-src-1",
              userId: "src-staff-pt",
              month: 10,
              year: 2026,
              netSalary: 5432100,
              status: "PAID",
              content: {
                name: "Nhân Viên Thật A",
                hourlyRate: 21500,
                totalSalary: 5432100,
                dailyDetails: [{ date: "2026-10-02", hours: 6, salary: 129000, multiplier: 1 }],
              },
            },
          ]),
        },
      };

      const res = await seedAndSanitizeDemoDatabase({
        force: true,
        sourcePrismaClient: mockSourcePrisma,
      });

      expect(res.skipped).toBe(false);
      // 3 source users + 1 auto-created PARTNER user = 4 users
      expect(res.usersSeeded).toBe(4);
      expect(mockUserCreate).toHaveBeenCalledTimes(4);

      const createdUsers = mockUserCreate.mock.calls.map((c) => c[0].data);
      const admin = createdUsers.find((u) => u.role === "ADMIN");
      const partner = createdUsers.find((u) => u.role === "PARTNER");
      const ptStaff = createdUsers.find((u) => u.id === "src-staff-pt");
      const ftStaff = createdUsers.find((u) => u.id === "src-staff-ft");

      expect(admin?.name).toBe("Nguyễn Minh Khôi (Chủ Shop Demo)");
      expect(admin?.email).toBe("owner@demomart.vn");
      expect(partner?.name).toBe("Trần Bảo Ngọc (Quản Lý Ca)");
      expect(partner?.email).toBe("manager@demomart.vn");

      expect(DEMO_STAFF_NAMES).toContain(ptStaff?.name);
      expect(ptStaff?.email).toBe("nv01@demomart.vn");
      expect(PART_TIME_RATES).toContain(ptStaff?.hourlyRate);
      expect(ptStaff?.monthlySalary).toBe(0);

      expect(DEMO_STAFF_NAMES).toContain(ftStaff?.name);
      expect(ftStaff?.email).toBe("nv02@demomart.vn");
      expect(FULL_TIME_SALARIES).toContain(ftStaff?.monthlySalary);
      expect(ftStaff?.hourlyRate).toBe(0);

      // Verify AllowedIP includes 0.0.0.0/0
      const createdIps = mockAllowedIPCreate.mock.calls.map((c) => c[0].data);
      expect(createdIps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ prefix: "0.0.0.0/0" }),
          expect.objectContaining({ prefix: "103.199." }),
        ])
      );

      // Verify Payslip was rewritten with anonymized name & rate
      expect(mockPayslipCreate).toHaveBeenCalledTimes(1);
      const savedPayslip = mockPayslipCreate.mock.calls[0][0].data;
      expect(JSON.stringify(savedPayslip.content)).not.toContain("Nhân Viên Thật A");
      expect(JSON.stringify(savedPayslip.content)).not.toContain("5432100");
      expect(savedPayslip.content.name).toBe(ptStaff?.name);
      expect(savedPayslip.content.hourlyRate).toBe(ptStaff?.hourlyRate);
    });
  });

  describe("/api/demo/* HTTP Endpoints & Public IP Check-in Bypass", () => {
    it("blocks /api/demo/* mutations with 403 and returns enabled: false when DEMO_SANDBOX_MODE !== true", async () => {
      process.env.DEMO_SANDBOX_MODE = "false";

      const statusRes = await app.request("/api/demo/status");
      expect(statusRes.status).toBe(200);
      const statusJson = await statusRes.json();
      expect(statusJson).toEqual({ success: true, enabled: false });

      const switchRes = await app.request("/api/demo/switch-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "ADMIN" }),
      });
      expect(switchRes.status).toBe(403);

      const modulesRes = await app.request("/api/demo/modules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gamification: false }),
      });
      expect(modulesRes.status).toBe(403);

      const resetRes = await app.request("/api/demo/reset", { method: "POST" });
      expect(resetRes.status).toBe(403);
    });

    it("returns full status, switches roles with JWT & cookie, toggles modules, and resets DB when DEMO_SANDBOX_MODE === true", async () => {
      process.env.DEMO_SANDBOX_MODE = "true";

      mockUserFindMany.mockResolvedValue([
        {
          id: "demo-admin-1",
          name: "Nguyễn Minh Khôi (Chủ Shop Demo)",
          email: "owner@demomart.vn",
          role: "ADMIN",
          image: "/icons/capy_dashboard.webp",
          employmentType: "FULL_TIME",
          hourlyRate: 0,
          monthlySalary: 15000000,
        },
        {
          id: "demo-partner-1",
          name: "Trần Bảo Ngọc (Quản Lý Ca)",
          email: "manager@demomart.vn",
          role: "PARTNER",
          image: "/icons/capy_manager.webp",
          employmentType: "FULL_TIME",
          hourlyRate: 0,
          monthlySalary: 10500000,
        },
        {
          id: "demo-staff-1",
          name: "Lê Hoàng Nam",
          email: "nv01@demomart.vn",
          role: "USER",
          image: "/capybara_mascot.webp",
          employmentType: "PART_TIME",
          hourlyRate: 25000,
          monthlySalary: 0,
        },
      ]);

      // 1. GET /api/demo/status
      const statusRes = await app.request("/api/demo/status");
      expect(statusRes.status).toBe(200);
      const statusData = await statusRes.json();
      expect(statusData.enabled).toBe(true);
      expect(statusData.tenantName).toBe("DemoMart — Super App Bán Lẻ");
      expect(statusData.modules).toEqual({
        attendance: true,
        piecework: true,
        operations: true,
        payroll: true,
        gamification: true,
        ai_sop: true,
      });
      expect(statusData.personas.length).toBeGreaterThanOrEqual(3);

      // 2. POST /api/demo/switch-role -> ADMIN
      mockUserCount.mockResolvedValue(3);
      mockUserFindUnique.mockResolvedValue({
        id: "demo-admin-1",
        name: "Nguyễn Minh Khôi (Chủ Shop Demo)",
        email: "owner@demomart.vn",
        role: "ADMIN",
        image: "/icons/capy_dashboard.webp",
        employmentType: "FULL_TIME",
        hourlyRate: 0,
        monthlySalary: 15000000,
        isActive: true,
        luckyWheelAllowed: true,
        staffTasksAllowed: true,
      });

      const switchRes = await app.request("/api/demo/switch-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "ADMIN" }),
      });
      expect(switchRes.status).toBe(200);
      const switchData = await switchRes.json();
      expect(switchData.success).toBe(true);
      expect(switchData.redirectTo).toBe("/admin");
      expect(switchData.user.email).toBe("owner@demomart.vn");
      expect(switchRes.headers.get("set-cookie")).toContain("access_token=");

      const decoded = await verifyAccessToken(switchData.token);
      expect(decoded?.sub).toBe("demo-admin-1");
      expect(decoded?.role).toBe("ADMIN");

      // 3. POST /api/demo/modules
      const modRes = await app.request("/api/demo/modules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modules: { gamification: false, ai_sop: false } }),
      });
      expect(modRes.status).toBe(200);
      const modData = await modRes.json();
      expect(modData.modules.gamification).toBe(false);
      expect(modData.modules.ai_sop).toBe(false);
      expect(modData.modules.attendance).toBe(true);

      // 4. POST /api/demo/reset
      const resetRes = await app.request("/api/demo/reset", { method: "POST" });
      expect(resetRes.status).toBe(200);
      const resetData = await resetRes.json();
      expect(resetData.success).toBe(true);
      expect(resetData.message).toContain("Đã random lại tên, mức lương");
    });

    it("allows IP verification from any IPv4 or IPv6 address when DEMO_SANDBOX_MODE is enabled", async () => {
      process.env.DEMO_SANDBOX_MODE = "true";
      mockAllowedIPFindMany.mockResolvedValue([
        { id: 1, prefix: "0.0.0.0/0", label: "Demo Public Mode (Mọi mạng WiFi/4G)" },
      ]);

      const resV4 = await app.request("/api/ip-status", {
        headers: { "x-forwarded-for": "203.113.152.99" },
      });
      expect(resV4.status).toBe(200);
      const dataV4 = await resV4.json();
      expect(dataV4.isAllowed).toBe(true);
      expect(dataV4.allowed).toBe(true);

      const resV6 = await app.request("/api/ip-status", {
        headers: { "x-forwarded-for": "2001:ee0:4f89:1234::1" },
      });
      expect(resV6.status).toBe(200);
      const dataV6 = await resV6.json();
      expect(dataV6.isAllowed).toBe(true);
      expect(dataV6.allowed).toBe(true);
    });
  });
});
