import { Hono } from "hono";
import { prisma } from "@checkin/db";
import { z } from "zod";
import * as XLSX from "xlsx";
import { applyHardworkingBonus, isLate } from "@checkin/shared";
import { authMiddleware, adminMiddleware, AppEnv } from "../middleware/auth.middleware";
import { getVietnamDayRange, getVietnamMonthRange, toVNDateString, VN_OFFSET_MS } from "../lib/date-utils";
import { calculateMonthlyPayrollSummary, calculateUserMonthlyStats } from "../lib/payroll-calculator";
import { getSpecialDays } from "../lib/special-days";
import { invalidateCachePattern, invalidatePayrollCache, invalidateShiftDutyCache, invalidateSpecialDaysCache, getOrSetCache, invalidateTaskSummaryCache } from "../lib/cache";
import { assertPeriodOpen } from "../lib/payroll-period";
import { sendPayslipEmail } from "../lib/email";
import { getClientIP } from "../lib/ip-utils";
import { recordSecureAuditLog } from "../lib/audit";
import { applyLateSchedulePenalty, reconcileFalseLateSchedulePenalties } from "../lib/schedule-penalty";
import { ensureAdminNaSchedule } from "../lib/auto-schedule";
import { closePayrollMonth } from "../lib/payroll-close";
import { isDemoSandboxEnabled } from "../lib/demo-sandbox";
import {
  getDefinitionsHandler,
  createDefinitionHandler,
  updateDefinitionHandler,
  deleteDefinitionHandler,
  getTaskItemsHandler,
  createTaskItemHandler,
  updateTaskItemHandler,
  updateTaskItemStatusHandler,
  resetTaskItemHandler,
  closeTaskItemHandler,
  deleteTaskItemHandler,
} from "./tasks.route";

export const adminRoute = new Hono<AppEnv>();

// All admin routes require authentication and admin role
adminRoute.use("*", authMiddleware, adminMiddleware);

// ============================================================================
// ============================================================================
// 1. DASHBOARD
// ============================================================================
adminRoute.get("/dashboard", async (c) => {
  try {
    const { startOfDay, endOfDay, dateStr } = getVietnamDayRange();
    const { month, year } = getVietnamMonthRange();

    const dataPayload = await getOrSetCache(
      "admin:dashboard:" + dateStr,
      30,
      async () => {
        const [userCount, ipCount, pendingRequests, checkinsRaw, todayShifts, payrollSummary, specialUsers, pendingTasksCount] =
          await Promise.all([
            prisma.user.count(),
            prisma.allowedIP.count(),
            prisma.request.count({ where: { status: "PENDING" } }),
            prisma.checkIn.findMany({
              where: { timestamp: { gte: startOfDay, lte: endOfDay } },
              include: {
                user: {
                  select: { id: true, name: true, email: true, image: true, role: true },
                },
              },
              orderBy: { timestamp: "asc" },
            }),
            prisma.workShift.findMany({
              where: { start: { gte: startOfDay, lte: endOfDay } },
              include: {
                user: {
                  select: { id: true, name: true, email: true, image: true, role: true },
                },
              },
              orderBy: { start: "asc" },
            }),
            getOrSetCache(
              `admin:dashboard:summary:${month}:${year}`,
              180,
              () => calculateMonthlyPayrollSummary(new Date()).catch(() => ({ totalPayroll: 0, totalProjected: 0, details: [] }))
            ),
            getSpecialDays(new Date()),
            Promise.all([
              (prisma as any).userTask?.count
                ? (prisma as any).userTask.count({ where: { status: "PENDING" } }).catch(() => 0)
                : Promise.resolve(0),
              (prisma as any).staffTask?.count
                ? (prisma as any).staffTask.count({ where: { status: "TODO" } }).catch(() => 0)
                : Promise.resolve(0),
            ]).then(([u, s]) => (u || 0) + (s || 0)),
          ]);

        // Calculate shift status for each checkin (early/late in minutes)
        const checkinsToday = (checkinsRaw as any[]).map((checkin: any) => {
          const userShifts = (todayShifts as any[]).filter((s: any) => s.userId === checkin.userId);
          let shiftStatus: {
            diffMins: number;
            isLate: boolean;
            isEarly: boolean;
            statusText: string;
          } | null = null;

          if (userShifts.length > 0) {
            let match: any = null;
            let minDiff = Infinity;

            for (const s of userShifts) {
              const target =
                checkin.type === "checkin"
                  ? new Date(s.start).getTime()
                  : new Date(s.end).getTime();
              const diff = Math.abs(new Date(checkin.timestamp).getTime() - target);
              if (diff < minDiff) {
                minDiff = diff;
                match = s;
              }
            }

            if (match) {
              const targetTime =
                checkin.type === "checkin"
                  ? new Date(match.start).getTime()
                  : new Date(match.end).getTime();
              const checkinTime = new Date(checkin.timestamp).getTime();
              const diffMins = Math.floor(checkinTime / 60000) - Math.floor(targetTime / 60000);

              // Grace period 1 min
              if (Math.abs(diffMins) > 1) {
                if (checkin.type === "checkin") {
                  shiftStatus = {
                    diffMins,
                    isLate: diffMins > 0,
                    isEarly: diffMins < 0,
                    statusText: diffMins > 0 ? `Trễ ${diffMins}p` : `Sớm ${Math.abs(diffMins)}p`,
                  };
                } else {
                  shiftStatus = {
                    diffMins,
                    isLate: diffMins > 0,
                    isEarly: diffMins < 0,
                    statusText: diffMins < 0 ? `Sớm ${Math.abs(diffMins)}p` : `Sau ${diffMins}p`,
                  };
                }
              }
            }
          }

          return {
            ...checkin,
            shiftStatus,
          };
        });

        const todayCheckinCount = (checkinsRaw as any[]).filter((ck: any) => ck.type === "checkin").length;
        const todayCheckoutCount = (checkinsRaw as any[]).filter((ck: any) => ck.type === "checkout").length;

        // Calculate onTimeRate & lateRate for checkins today
        const inCheckins = (checkinsRaw as any[]).filter((ck: any) => ck.type === "checkin");
        let onTimeCount = 0;
        let lateCount = 0;

        for (const checkin of inCheckins) {
          const userShifts = (todayShifts as any[]).filter((s: any) => s.userId === checkin.userId);
          if (userShifts.length > 0) {
            let match: any = null;
            let minDiff = Infinity;

            for (const s of userShifts) {
              const target = new Date(s.start).getTime();
              const diff = Math.abs(new Date(checkin.timestamp).getTime() - target);
              if (diff < minDiff) {
                minDiff = diff;
                match = s;
              }
            }

            if (match) {
              const targetTime = new Date(match.start).getTime();
              const checkinTime = new Date(checkin.timestamp).getTime();
              const diffMins = Math.floor(checkinTime / 60000) - Math.floor(targetTime / 60000);

              if (diffMins > 5) {
                lateCount++;
              } else {
                onTimeCount++;
              }
            } else {
              onTimeCount++;
            }
          } else {
            onTimeCount++;
          }
        }

        const totalEvaluated = onTimeCount + lateCount;
        const onTimeRate = totalEvaluated > 0 ? Math.round((onTimeCount / totalEvaluated) * 1000) / 10 : 100;
        const lateRate = totalEvaluated > 0 ? Math.round((lateCount / totalEvaluated) * 1000) / 10 : 0;
        const estimatedMonthPayroll = payrollSummary?.totalProjected || payrollSummary?.totalPayroll || 0;

        return {
          todayCheckinCount,
          todayCheckoutCount,
          pendingRequestsCount: pendingRequests,
          pendingTasksCount,
          totalEmployeesCount: userCount,
          estimatedMonthPayroll,
          onTimeRate,
          lateRate,
          todayShifts,
          specialUsers,
          checkinsToday,
          userCount,
          ipCount,
          pendingRequests,
          payrollSummary,
        };
      }
    );

    return c.json({
      success: true,
      ...dataPayload,
      data: dataPayload,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to load dashboard data" },
      500
    );
  }
});

// GET /api/admin/dashboard-stats
adminRoute.get("/dashboard-stats", async (c) => {
  try {
    const { startOfDay, endOfDay, dateStr } = getVietnamDayRange();
    const { month, year } = getVietnamMonthRange();

    const statsPayload = await getOrSetCache(
      "admin:dashboard-stats:" + dateStr,
      30,
      async () => {
        const [
          totalEmployeesCount,
          pendingRequestsCount,
          checkinsRaw,
          todayShifts,
          payrollSummary,
          pendingTasksCount,
          specialUsers,
        ] = await Promise.all([
          prisma.user.count(),
          prisma.request.count({ where: { status: "PENDING" } }),
          prisma.checkIn.findMany({
            where: { timestamp: { gte: startOfDay, lte: endOfDay } },
            include: {
              user: {
                select: { id: true, name: true, email: true, image: true, role: true },
              },
            },
            orderBy: { timestamp: "asc" },
          }),
          prisma.workShift.findMany({
            where: { start: { gte: startOfDay, lte: endOfDay } },
            include: {
              user: {
                select: { id: true, name: true, email: true, image: true, role: true },
              },
            },
            orderBy: { start: "asc" },
          }),
          getOrSetCache(
            `admin:dashboard:summary:${month}:${year}`,
            180,
            () => calculateMonthlyPayrollSummary(new Date()).catch(() => ({ totalPayroll: 0, totalProjected: 0, details: [] }))
          ),
          Promise.all([
            (prisma as any).userTask?.count
              ? (prisma as any).userTask.count({ where: { status: "PENDING" } }).catch(() => 0)
              : Promise.resolve(0),
            (prisma as any).staffTask?.count
              ? (prisma as any).staffTask.count({ where: { status: "TODO" } }).catch(() => 0)
              : Promise.resolve(0),
          ]).then(([u, s]) => (u || 0) + (s || 0)),
          getSpecialDays(new Date()),
        ]);

        // Calculate shift status for each checkin
        const checkinsToday = (checkinsRaw as any[]).map((checkin: any) => {
          const userShifts = (todayShifts as any[]).filter((s: any) => s.userId === checkin.userId);
          let shiftStatus: {
            diffMins: number;
            isLate: boolean;
            isEarly: boolean;
            statusText: string;
          } | null = null;

          if (userShifts.length > 0) {
            let match: any = null;
            let minDiff = Infinity;

            for (const s of userShifts) {
              const target =
                checkin.type === "checkin"
                  ? new Date(s.start).getTime()
                  : new Date(s.end).getTime();
              const diff = Math.abs(new Date(checkin.timestamp).getTime() - target);
              if (diff < minDiff) {
                minDiff = diff;
                match = s;
              }
            }

            if (match) {
              const targetTime =
                checkin.type === "checkin"
                  ? new Date(match.start).getTime()
                  : new Date(match.end).getTime();
              const checkinTime = new Date(checkin.timestamp).getTime();
              const diffMins = Math.floor(checkinTime / 60000) - Math.floor(targetTime / 60000);

              if (Math.abs(diffMins) > 1) {
                if (checkin.type === "checkin") {
                  shiftStatus = {
                    diffMins,
                    isLate: diffMins > 0,
                    isEarly: diffMins < 0,
                    statusText: diffMins > 0 ? `Trễ ${diffMins}p` : `Sớm ${Math.abs(diffMins)}p`,
                  };
                } else {
                  shiftStatus = {
                    diffMins,
                    isLate: diffMins > 0,
                    isEarly: diffMins < 0,
                    statusText: diffMins < 0 ? `Sớm ${Math.abs(diffMins)}p` : `Sau ${diffMins}p`,
                  };
                }
              }
            }
          }

          return {
            ...checkin,
            shiftStatus,
          };
        });

        const todayCheckinCount = (checkinsRaw as any[]).filter((ck: any) => ck.type === "checkin").length;
        const todayCheckoutCount = (checkinsRaw as any[]).filter((ck: any) => ck.type === "checkout").length;

        // Calculate onTimeRate & lateRate for checkins today
        const inCheckins = (checkinsRaw as any[]).filter((ck: any) => ck.type === "checkin");
        let onTimeCount = 0;
        let lateCount = 0;

        for (const checkin of inCheckins) {
          const userShifts = (todayShifts as any[]).filter((s: any) => s.userId === checkin.userId);
          if (userShifts.length > 0) {
            let match: any = null;
            let minDiff = Infinity;

            for (const s of userShifts) {
              const target = new Date(s.start).getTime();
              const diff = Math.abs(new Date(checkin.timestamp).getTime() - target);
              if (diff < minDiff) {
                minDiff = diff;
                match = s;
              }
            }

            if (match) {
              const targetTime = new Date(match.start).getTime();
              const checkinTime = new Date(checkin.timestamp).getTime();
              const diffMins = Math.floor(checkinTime / 60000) - Math.floor(targetTime / 60000);

              if (diffMins > 5) {
                lateCount++;
              } else {
                onTimeCount++;
              }
            } else {
              onTimeCount++;
            }
          } else {
            onTimeCount++;
          }
        }

        const totalEvaluated = onTimeCount + lateCount;
        const onTimeRate = totalEvaluated > 0 ? Math.round((onTimeCount / totalEvaluated) * 1000) / 10 : 100;
        const lateRate = totalEvaluated > 0 ? Math.round((lateCount / totalEvaluated) * 1000) / 10 : 0;
        const estimatedMonthPayroll = payrollSummary?.totalProjected || payrollSummary?.totalPayroll || 0;

        return {
          todayCheckinCount,
          todayCheckoutCount,
          pendingRequestsCount,
          pendingTasksCount,
          totalEmployeesCount,
          estimatedMonthPayroll,
          onTimeRate,
          lateRate,
          todayShifts,
          specialUsers,
          checkinsToday,
        };
      }
    );

    return c.json({
      success: true,
      ...statsPayload,
      data: statsPayload,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to load dashboard stats" },
      500
    );
  }
});

// ============================================================================
// DATA EXPORT (XLSX)
// ============================================================================
adminRoute.get("/export", async (c) => {
  try {
    if (isDemoSandboxEnabled()) {
      return c.json(
        {
          success: false,
          error: "Tính năng xuất dữ liệu bị khóa trên môi trường Demo công khai",
        },
        403
      );
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `backup_data_${timestamp}.xlsx`;
    const workbook = XLSX.utils.book_new();

    const fromStr = c.req.query("from");
    const toStr = c.req.query("to");

    let dateFilter: any = {};
    if (fromStr || toStr) {
      dateFilter = {};
      if (fromStr) {
        dateFilter.gte = new Date(fromStr + "T00:00:00.000Z");
      }
      if (toStr) {
        dateFilter.lte = new Date(toStr + "T23:59:59.999Z");
      }
    }

    const checkinWhere = Object.keys(dateFilter).length > 0 ? { timestamp: dateFilter } : {};
    const shiftWhere = Object.keys(dateFilter).length > 0 ? { start: dateFilter } : {};
    const requestWhere = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

    const [users, checkins, shifts, requests] = await Promise.all([
      prisma.user.findMany({ orderBy: { name: "asc" } }),
      prisma.checkIn.findMany({
        where: checkinWhere,
        include: { user: true },
        orderBy: { timestamp: "desc" },
      }),
      prisma.workShift.findMany({
        where: shiftWhere,
        include: { user: true },
        orderBy: { start: "desc" },
      }),
      prisma.request.findMany({
        where: requestWhere,
        include: { user: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // 1. Users
    const userRows = users.map((u: any) => ({
      ID: u.id,
      Name: u.name,
      Email: u.email,
      Role: u.role,
      EmploymentType: u.employmentType,
      HourlyRate: u.hourlyRate,
      Active: u.isActive !== false ? "Đang làm việc" : "Đã nghỉ việc",
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(userRows), "Users");

    // 2. CheckIns
    const checkinRows = checkins.map((ck: any) => ({
      ID: ck.id,
      User: ck.user?.name,
      Email: ck.user?.email,
      Type: ck.type,
      Timestamp: ck.timestamp,
      IP: ck.ipAddress,
      Note: ck.note,
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(checkinRows), "CheckIns");

    // 3. Shifts
    const shiftRows = shifts.map((s: any) => ({
      ID: s.id,
      User: s.user?.name,
      Email: s.user?.email,
      Start_Time: s.start,
      End_Time: s.end,
      Duration_Hours: parseFloat(((s.end.getTime() - s.start.getTime()) / 3600000).toFixed(2)),
      Status: s.status,
      Created_At: s.createdAt,
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(shiftRows), "WorkShifts");

    // 4. Requests
    const requestRows = requests.map((r: any) => ({
      ID: r.id,
      User: r.user?.name,
      Email: r.user?.email,
      Type: r.type,
      Status: r.status,
      Reason: r.reason,
      CreatedAt: r.createdAt,
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(requestRows), "Requests");

    const buf = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    c.header("Content-Disposition", `attachment; filename="${filename}"`);
    c.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return c.body(buf);
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Export failed" }, 500);
  }
});

// ============================================================================
// 2. USERS MANAGEMENT
// ============================================================================
const CreateUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  employmentType: z.enum(["FULL_TIME", "PART_TIME"]).default("PART_TIME"),
  hourlyRate: z.number().default(0),
  monthlySalary: z.number().default(6000000),
  role: z.enum(["USER", "ADMIN", "PARTNER"]).default("USER"),
  birthday: z.string().optional(),
  startDate: z.string().optional(),
  staffTasksAllowed: z.boolean().optional(),
});

const UpdateUserSchema = z.object({
  name: z.string().optional(),
  role: z.enum(["USER", "ADMIN", "PARTNER"]).optional(),
  hourlyRate: z.number().optional(),
  monthlySalary: z.number().optional(),
  employmentType: z.enum(["FULL_TIME", "PART_TIME"]).optional(),
  birthday: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  luckyWheelAllowed: z.boolean().optional(),
  staffTasksAllowed: z.boolean().optional(),
});

// GET /api/admin/users
adminRoute.get("/users", async (c) => {
  try {
    const users = await getOrSetCache("admin:employees:all", 300, async () => {
      return prisma.user.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          image: true,
          isActive: true,
          luckyWheelAllowed: true,
          employmentType: true,
          hourlyRate: true,
          monthlySalary: true,
          birthday: true,
          startDate: true,
          staffTasksAllowed: true,
        },
      });
    });

    return c.json({ success: true, data: users });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to fetch users" },
      500
    );
  }
});

// GET /api/admin/employees (alias to /users)
adminRoute.get("/employees", async (c) => {
  try {
    const users = await getOrSetCache("admin:employees:all", 300, async () => {
      return prisma.user.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          image: true,
          isActive: true,
          luckyWheelAllowed: true,
          employmentType: true,
          hourlyRate: true,
          monthlySalary: true,
          birthday: true,
          startDate: true,
          staffTasksAllowed: true,
        },
      });
    });

    return c.json({ success: true, data: users });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to fetch employees" },
      500
    );
  }
});

// GET /api/admin/employees/:id
adminRoute.get("/employees/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const now = new Date();
    const month = parseInt(c.req.query("month") || "", 10) || now.getMonth() + 1;
    const year = parseInt(c.req.query("year") || "", 10) || now.getFullYear();
    const targetDate = new Date(year, month - 1, 1);
    const { startDate, endDate } = getVietnamMonthRange(month, year);

    const cacheKey = `admin:employee-detail:${id}:${month}:${year}`;
    const data = await getOrSetCache(cacheKey, 60, async () => {
      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          achievements: true,
          adjustments: {
            where: { date: { gte: startDate, lte: endDate } },
            orderBy: { date: "desc" },
          },
          requests: {
            orderBy: { createdAt: "desc" },
            take: 20,
          },
        },
      });

      if (!user) {
        return null;
      }

      const stats = await calculateUserMonthlyStats(user.id, targetDate);
      return { user, stats };
    });

    if (!data) {
      return c.json({ success: false, error: "Không tìm thấy nhân viên" }, 404);
    }

    return c.json({
      success: true,
      data,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to fetch employee details" },
      500
    );
  }
});

// PATCH /api/admin/employees/:id/status and alias /api/admin/users/:id/status
const handleUpdateUserStatus = async (c: any) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const isActive = Boolean(body.isActive);

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { isActive },
    });

    // If deactivated, delete existing user sessions
    if (!isActive) {
      await prisma.session.deleteMany({ where: { userId: id } });
    }

    await Promise.all([
      invalidateCachePattern("admin:employees:*"),
      invalidateCachePattern("admin:employee-detail:*"),
      invalidateCachePattern("admin:manager-tasks:*"),
      invalidateCachePattern("user:me:" + id),
      invalidateSpecialDaysCache(),
    ]).catch(() => {});

    return c.json({
      success: true,
      message: `Đã ${isActive ? "kích hoạt" : "vô hiệu hóa"} nhân viên thành công`,
      data: updatedUser,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to update employee status" },
      500
    );
  }
};
adminRoute.patch("/employees/:id/status", handleUpdateUserStatus);
adminRoute.patch("/users/:id/status", handleUpdateUserStatus);

// Common handler for creating user/employee
const handleCreateUser = async (c: any) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const parseResult = CreateUserSchema.safeParse(body);

    if (!parseResult.success) {
      return c.json(
        {
          success: false,
          error: "Invalid request payload",
          details: parseResult.error.flatten(),
        },
        400
      );
    }

    const {
      name,
      email,
      employmentType,
      hourlyRate,
      monthlySalary,
      role,
      birthday,
      startDate,
      staffTasksAllowed,
    } = parseResult.data;

    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existing) {
      return c.json(
        { success: false, error: "Email này đã tồn tại trong hệ thống" },
        400
      );
    }

    const newUser = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase().trim(),
        employmentType,
        hourlyRate,
        monthlySalary,
        role,
        birthday: birthday ? new Date(birthday) : null,
        startDate: startDate ? new Date(startDate) : null,
        staffTasksAllowed: staffTasksAllowed !== undefined ? staffTasksAllowed : (role === "PARTNER" ? true : false),
      },
    });

    await Promise.all([
      invalidatePayrollCache(),
      invalidateCachePattern("admin:employees:*"),
      invalidateCachePattern("admin:manager-tasks:*"),
      invalidateSpecialDaysCache(),
    ]).catch(() => {});

    return c.json(
      {
        success: true,
        message: "Đã thêm nhân viên mới thành công!",
        data: newUser,
      },
      201
    );
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to create user" },
      500
    );
  }
};

// Common handler for updating user/employee
const handleUpdateUser = async (c: any) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const parseResult = UpdateUserSchema.safeParse(body);

    if (!parseResult.success) {
      return c.json(
        {
          success: false,
          error: "Invalid update payload",
          details: parseResult.error.flatten(),
        },
        400
      );
    }

    const data: any = {};
    const {
      name,
      role,
      hourlyRate,
      monthlySalary,
      employmentType,
      birthday,
      startDate,
      isActive,
      luckyWheelAllowed,
      staffTasksAllowed,
    } = parseResult.data;

    if (name !== undefined) data.name = name;
    if (role !== undefined) {
      data.role = role;
      if (role === "PARTNER") {
        data.staffTasksAllowed = true;
      }
    }
    if (hourlyRate !== undefined) data.hourlyRate = hourlyRate;
    if (monthlySalary !== undefined) data.monthlySalary = monthlySalary;
    if (employmentType !== undefined) data.employmentType = employmentType;
    if (birthday !== undefined) data.birthday = birthday ? new Date(birthday) : null;
    if (startDate !== undefined) data.startDate = startDate ? new Date(startDate) : null;
    if (isActive !== undefined) data.isActive = isActive;
    if (luckyWheelAllowed !== undefined) data.luckyWheelAllowed = luckyWheelAllowed;
    if (staffTasksAllowed !== undefined) data.staffTasksAllowed = staffTasksAllowed;

    const updatedUser = await prisma.user.update({
      where: { id },
      data,
    });

    // If deactivated, delete existing user sessions
    if (isActive === false) {
      await prisma.session.deleteMany({ where: { userId: id } });
    }

    // If employmentType set to FULL_TIME, auto-generate standard schedule (Mon-Sat 9h-17h VN time) for next 3 months
    if (employmentType === "FULL_TIME") {
      const now = new Date();
      const endLimit = new Date();
      endLimit.setMonth(endLimit.getMonth() + 3);

      const existingShifts = await prisma.workShift.findMany({
        where: {
          userId: id,
          start: { gte: now, lte: endLimit },
        },
        select: { start: true },
      });
      const existingDateKeys = new Set(
        existingShifts.map((s) => s.start.toISOString().split("T")[0])
      );

      const shiftsToCreate = [];
      for (let d = new Date(now); d <= endLimit; d.setDate(d.getDate() + 1)) {
        if (d.getDay() === 0) continue; // Skip Sunday

        const shiftStart = new Date(d);
        shiftStart.setUTCHours(2, 0, 0, 0); // 09:00 VN time (UTC+7)
        const shiftEnd = new Date(d);
        shiftEnd.setUTCHours(10, 0, 0, 0); // 17:00 VN time (UTC+7)

        const dateKey = shiftStart.toISOString().split("T")[0];
        if (!existingDateKeys.has(dateKey)) {
          shiftsToCreate.push({
            userId: id,
            start: shiftStart,
            end: shiftEnd,
            status: "APPROVED",
          });
        }
      }

      if (shiftsToCreate.length > 0) {
        await prisma.workShift.createMany({ data: shiftsToCreate });
      }
    }

    await Promise.all([
      invalidatePayrollCache(),
      invalidateShiftDutyCache(id),
      invalidateCachePattern("admin:employees:*"),
      invalidateCachePattern("admin:employee-detail:*"),
      invalidateCachePattern("admin:manager-tasks:*"),
      invalidateCachePattern("admin:schedule:*"),
      invalidateCachePattern("admin:schedule:history:*"),
      invalidateCachePattern("user:me:" + id),
      invalidateSpecialDaysCache(),
    ]).catch(() => {});

    return c.json({
      success: true,
      message: "Cập nhật nhân viên thành công",
      data: updatedUser,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to update user" },
      500
    );
  }
};

// Common handler for deleting user/employee
const handleDeleteUser = async (c: any) => {
  try {
    const id = c.req.param("id");
    await prisma.user.delete({ where: { id } });

    await Promise.all([
      invalidatePayrollCache(),
      invalidateShiftDutyCache(id),
      invalidateCachePattern("admin:employees:*"),
      invalidateCachePattern("admin:employee-detail:*"),
      invalidateCachePattern("admin:manager-tasks:*"),
      invalidateCachePattern("user:me:" + id),
      invalidateSpecialDaysCache(),
    ]).catch(() => {});

    return c.json({ success: true, message: "Đã xóa nhân viên thành công" });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to delete user" },
      500
    );
  }
};

// POST /api/admin/users and alias /api/admin/employees
adminRoute.post("/users", handleCreateUser);
adminRoute.post("/employees", handleCreateUser);

// PUT and PATCH /api/admin/users/:id and alias /api/admin/employees/:id
adminRoute.put("/users/:id", handleUpdateUser);
adminRoute.put("/employees/:id", handleUpdateUser);
adminRoute.patch("/users/:id", handleUpdateUser);
adminRoute.patch("/employees/:id", handleUpdateUser);

// DELETE /api/admin/users/:id and alias /api/admin/employees/:id
adminRoute.delete("/users/:id", handleDeleteUser);
adminRoute.delete("/employees/:id", handleDeleteUser);

// ============================================================================
// 3. ALLOWED IP SETTINGS
// ============================================================================
// GET /api/admin/ip-settings
adminRoute.get("/ip-settings", async (c) => {
  try {
    const ips = await getOrSetCache("config:allowed-ips:list", 600, async () => {
      return prisma.allowedIP.findMany({
        orderBy: { createdAt: "desc" },
      });
    });
    return c.json({ success: true, data: ips });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to fetch IP settings" },
      500
    );
  }
});

// POST /api/admin/ip-settings
adminRoute.post("/ip-settings", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    if (!body.prefix) {
      return c.json({ success: false, error: "IP Prefix is required" }, 400);
    }

    const newIp = await prisma.allowedIP.create({
      data: {
        prefix: body.prefix.trim(),
        label: body.label?.trim() || null,
      },
    });

    await invalidateCachePattern("config:allowed-ips*");

    return c.json(
      { success: true, message: "Đã thêm IP thành công!", data: newIp },
      201
    );
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Lỗi: IP này có thể đã tồn tại" },
      400
    );
  }
});

// DELETE /api/admin/ip-settings/:id
adminRoute.delete("/ip-settings/:id", async (c) => {
  try {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) {
      return c.json({ success: false, error: "Invalid IP id" }, 400);
    }

    await prisma.allowedIP.delete({ where: { id } });
    await invalidateCachePattern("config:allowed-ips*");
    return c.json({ success: true, message: "Đã xóa IP thành công" });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to delete IP" },
      500
    );
  }
});

// Aliases for /settings/ips
adminRoute.get("/settings/ips", async (c) => {
  try {
    const ips = await getOrSetCache("config:allowed-ips:list", 600, async () => {
      return prisma.allowedIP.findMany({
        orderBy: { createdAt: "desc" },
      });
    });
    return c.json(ips);
  } catch (err: any) {
    return c.json([], 500);
  }
});

adminRoute.post("/settings/ips", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    if (!body.prefix) {
      return c.json({ success: false, error: "IP Prefix is required" }, 400);
    }
    const newIp = await prisma.allowedIP.create({
      data: {
        prefix: body.prefix.trim(),
        label: body.label?.trim() || null,
      },
    });
    await invalidateCachePattern("config:allowed-ips*");
    return c.json({ success: true, message: "Đã thêm IP thành công!", data: newIp }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Lỗi thêm IP" }, 400);
  }
});

adminRoute.delete("/settings/ips/:id", async (c) => {
  try {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return c.json({ success: false, error: "Invalid IP id" }, 400);
    await prisma.allowedIP.delete({ where: { id } });
    await invalidateCachePattern("config:allowed-ips*");
    return c.json({ success: true, message: "Đã xóa IP thành công" });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to delete IP" }, 500);
  }
});

// Holiday Settings
const handleGetHolidays = async (c: any) => {
  try {
    const holidays = await getOrSetCache("meta:holidays:all", 1800, async () => {
      const list = await prisma.holiday.findMany({
        orderBy: { date: "asc" },
      });
      return list.map((h) => ({
        id: h.id,
        date: h.date instanceof Date ? h.date.toISOString().split("T")[0] : new Date(h.date).toISOString().split("T")[0],
        name: h.name,
        multiplier: h.multiplier,
      }));
    });
    return c.json(holidays);
  } catch (err: any) {
    return c.json([], 500);
  }
};

const handleSaveHoliday = async (c: any) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { date, name, multiplier } = body;
    if (!date || !name) {
      return c.json({ success: false, error: "date and name are required" }, 400);
    }
    const holiday = await prisma.holiday.upsert({
      where: { date: new Date(date) },
      create: {
        date: new Date(date),
        name: name.trim(),
        multiplier: parseFloat(multiplier) || 3.0,
      },
      update: {
        name: name.trim(),
        multiplier: parseFloat(multiplier) || 3.0,
      },
    });
    await Promise.all([
      invalidatePayrollCache(),
      invalidateSpecialDaysCache(),
      invalidateCachePattern("meta:holidays:*"),
    ]).catch(() => {});
    return c.json(
      {
        id: holiday.id,
        date: holiday.date.toISOString().split("T")[0],
        name: holiday.name,
        multiplier: holiday.multiplier,
      },
      201
    );
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to save holiday" }, 500);
  }
};

const handleDeleteHoliday = async (c: any) => {
  try {
    const id = c.req.param("id");
    await prisma.holiday.delete({ where: { id } });
    await Promise.all([
      invalidatePayrollCache(),
      invalidateSpecialDaysCache(),
      invalidateCachePattern("meta:holidays:*"),
    ]).catch(() => {});
    return c.json({ success: true, message: "Đã xóa ngày lễ" });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to delete holiday" }, 500);
  }
};

adminRoute.get("/settings/holidays", handleGetHolidays);
adminRoute.get("/holidays", handleGetHolidays);
adminRoute.post("/settings/holidays", handleSaveHoliday);
adminRoute.post("/holidays", handleSaveHoliday);
adminRoute.delete("/settings/holidays/:id", handleDeleteHoliday);
adminRoute.delete("/holidays/:id", handleDeleteHoliday);

// ============================================================================
// 4. MANUAL CHECKIN
// ============================================================================
// POST /api/admin/manual-checkin & POST /api/admin/checkin/manual
const handleManualCheckin = async (c: any) => {
  try {
    const tokenPayload = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const { userId, date, checkInTime, checkOutTime } = body;

    if (!userId || !date) {
      return c.json(
        { success: false, error: "userId and date (YYYY-MM-DD) are required" },
        400
      );
    }

    const adminName = tokenPayload?.name || "Admin";
    const note = `Admin ${adminName} chấm công hộ`;

    // Calculate VN day range
    const startOfDay = new Date(`${date}T00:00:00+07:00`);
    const endOfDay = new Date(`${date}T23:59:59.999+07:00`);

    // Clear existing records for this day to allow override
    await prisma.checkIn.deleteMany({
      where: {
        userId,
        timestamp: { gte: startOfDay, lte: endOfDay },
      },
    });

    if (checkInTime) {
      const targetDate = new Date(`${date}T${checkInTime}:00+07:00`);
      await prisma.checkIn.create({
        data: {
          userId,
          type: "checkin",
          timestamp: targetDate,
          ipAddress: "Manual",
          note,
        },
      });
    }

    if (checkOutTime) {
      const targetDate = new Date(`${date}T${checkOutTime}:00+07:00`);
      await prisma.checkIn.create({
        data: {
          userId,
          type: "checkout",
          timestamp: targetDate,
          ipAddress: "Manual",
          note,
        },
      });
    }

    // Session Audit Log for manual checkin
    const clientIP = getClientIP(c);
    const userAgent = c.req.header("user-agent") || null;
    await recordSecureAuditLog({
      userId: tokenPayload?.sub || null,
      action: "MANUAL_CHECKIN",
      status: "SUCCESS",
      ipAddress: clientIP,
      userAgent: userAgent,
      device: "Desktop",
      details: {
        targetUserId: userId,
        date,
        checkInTime,
        checkOutTime,
      },
      requestId: c.var.requestId || c.get("requestId"),
    });

    // Invalidate payroll, stats, home-data, today checkin and dashboard cache immediately
    await Promise.all([
      invalidateCachePattern("payroll:*"),
      invalidateCachePattern("stats:*"),
      invalidateCachePattern("stats:monthly:*"),
      invalidateCachePattern("admin:dashboard*"),
      invalidateCachePattern("admin:reports:*"),
      invalidateCachePattern(`staff:home:${userId}:*`),
      invalidateCachePattern(`checkin:today:${userId}:*`),
      invalidateCachePattern("checkin:today:all:*"),
      invalidateCachePattern("checkin:status:*"),
      invalidateCachePattern("staff:history:*"),
      invalidateCachePattern("staff:payroll:*"),
      invalidateCachePattern("staff:rewards:leaderboard:*"),
    ]).catch((e: any) => console.warn("[Cache Invalidation Warning]", e));

    return c.json({
      success: true,
      message: "Đã chấm công hộ thành công!",
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to perform manual checkin" },
      500
    );
  }
};

adminRoute.post("/manual-checkin", handleManualCheckin);
adminRoute.post("/checkin/manual", handleManualCheckin);

// DELETE /api/admin/checkin/:id & DELETE /api/admin/checkins/:id
const handleDeleteCheckin = async (c: any) => {
  try {
    const tokenPayload = c.get("user");
    const idParam = c.req.param("id");
    const checkinId = parseInt(idParam, 10);

    if (isNaN(checkinId)) {
      return c.json({ success: false, error: "Invalid checkin id" }, 400);
    }

    const checkin = await prisma.checkIn.findUnique({
      where: { id: checkinId },
    });

    if (!checkin) {
      return c.json({ success: false, error: "Bản ghi chấm công không tồn tại" }, 404);
    }

    await prisma.checkIn.delete({
      where: { id: checkinId },
    });

    const clientIP = getClientIP(c);
    const userAgent = c.req.header("user-agent") || null;
    await recordSecureAuditLog({
      userId: tokenPayload?.sub || null,
      action: "DELETE_CHECKIN",
      status: "SUCCESS",
      ipAddress: clientIP,
      userAgent: userAgent,
      device: "Desktop",
      details: {
        checkinId,
        targetUserId: checkin.userId,
        timestamp: checkin.timestamp,
        type: checkin.type,
      },
      requestId: c.var.requestId || c.get("requestId"),
    });

    await Promise.all([
      invalidateCachePattern("payroll:*"),
      invalidateCachePattern("stats:*"),
      invalidateCachePattern("stats:monthly:*"),
      invalidateCachePattern("admin:dashboard*"),
      invalidateCachePattern("admin:reports:*"),
      invalidateCachePattern(`staff:home:${checkin.userId}:*`),
      invalidateCachePattern(`checkin:today:${checkin.userId}:*`),
      invalidateCachePattern("checkin:today:all:*"),
      invalidateCachePattern("checkin:status:*"),
      invalidateCachePattern("staff:history:*"),
      invalidateCachePattern("staff:payroll:*"),
      invalidateCachePattern("staff:rewards:leaderboard:*"),
    ]).catch((e: any) => console.warn("[Cache Invalidation Warning]", e));

    return c.json({
      success: true,
      message: "Đã xóa bản ghi chấm công thành công!",
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to delete checkin" },
      500
    );
  }
};

adminRoute.delete("/checkin/:id", handleDeleteCheckin);
adminRoute.delete("/checkins/:id", handleDeleteCheckin);

// ============================================================================
// 5. REQUESTS MANAGEMENT
// ============================================================================
// GET /api/admin/requests
adminRoute.get("/requests", async (c) => {
  try {
    const requests = await getOrSetCache("admin:requests:all", 60, async () => {
      return await prisma.request.findMany({
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true, role: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    });

    return c.json({ success: true, data: requests });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to fetch admin requests" },
      500
    );
  }
});

// POST /api/admin/requests/:id/action
adminRoute.post("/requests/:id/action", async (c) => {
  try {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) {
      return c.json({ success: false, error: "Invalid request id" }, 400);
    }

    const body = await c.req.json().catch(() => ({}));
    const action = body.action;

    if (action !== "APPROVED" && action !== "REJECTED") {
      return c.json(
        { success: false, error: "Action must be APPROVED or REJECTED" },
        400
      );
    }

    const updated = await prisma.request.update({
      where: { id },
      data: { status: action },
    });

    await Promise.all([
      invalidatePayrollCache(),
      invalidateShiftDutyCache(),
      invalidateCachePattern("user:requests:*"),
      invalidateCachePattern("admin:requests:*"),
      invalidateCachePattern("admin:dashboard*"),
      invalidateCachePattern("staff:home:*"),
    ]).catch(() => {});

    return c.json({
      success: true,
      message: action === "APPROVED" ? "Đã duyệt đơn thành công" : "Đã từ chối đơn",
      data: updated,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to process request action" },
      500
    );
  }
});

// POST /api/admin/requests/:id/approve
adminRoute.post("/requests/:id/approve", async (c) => {
  try {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) {
      return c.json({ success: false, error: "Invalid request id" }, 400);
    }

    const updated = await prisma.request.update({
      where: { id },
      data: { status: "APPROVED" },
    });

    await Promise.all([
      invalidatePayrollCache(),
      invalidateShiftDutyCache(),
      invalidateCachePattern("user:requests:*"),
      invalidateCachePattern("admin:requests:*"),
      invalidateCachePattern("admin:dashboard*"),
      invalidateCachePattern("staff:home:*"),
    ]).catch(() => {});

    return c.json({
      success: true,
      message: "Đã duyệt đơn",
      data: updated,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to approve request" },
      500
    );
  }
});

// POST /api/admin/requests/:id/reject
adminRoute.post("/requests/:id/reject", async (c) => {
  try {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) {
      return c.json({ success: false, error: "Invalid request id" }, 400);
    }

    const body = await c.req.json().catch(() => ({}));
    const updated = await prisma.request.update({
      where: { id },
      data: { status: "REJECTED" },
    });

    await Promise.all([
      invalidatePayrollCache(),
      invalidateShiftDutyCache(),
      invalidateCachePattern("user:requests:*"),
      invalidateCachePattern("admin:requests:*"),
      invalidateCachePattern("admin:dashboard*"),
      invalidateCachePattern("staff:home:*"),
    ]).catch(() => {});

    return c.json({
      success: true,
      message: "Đã từ chối đơn",
      data: updated,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to reject request" },
      500
    );
  }
});

// ============================================================================
// 6. ANNOUNCEMENTS MANAGEMENT
// ============================================================================
// GET /api/admin/announcements
adminRoute.get("/announcements", async (c) => {
  try {
    const announcements = await getOrSetCache("admin:announcements:all", 300, async () => {
      return prisma.announcement.findMany({
        orderBy: { createdAt: "desc" },
      });
    });
    return c.json({ success: true, data: announcements });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to fetch announcements" },
      500
    );
  }
});

// POST /api/admin/announcements
adminRoute.post("/announcements", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    if (!body.title || !body.content) {
      return c.json(
        { success: false, error: "Title and content are required" },
        400
      );
    }

    const newAnnouncement = await prisma.announcement.create({
      data: {
        title: body.title,
        content: body.content,
        type: body.type || "INFO",
        active: true,
      },
    });

    await Promise.all([
      invalidateCachePattern("admin:announcements:*"),
      invalidateCachePattern("staff:home:*"),
    ]).catch(() => {});

    return c.json(
      {
        success: true,
        message: "Đã đăng thông báo thành công!",
        data: newAnnouncement,
      },
      201
    );
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to create announcement" },
      500
    );
  }
});

// DELETE /api/admin/announcements/:id
adminRoute.delete("/announcements/:id", async (c) => {
  try {
    const id = c.req.param("id");
    await prisma.announcement.delete({ where: { id } });

    await Promise.all([
      invalidateCachePattern("admin:announcements:*"),
      invalidateCachePattern("staff:home:*"),
    ]).catch(() => {});

    return c.json({ success: true, message: "Đã xóa thông báo thành công!" });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to delete announcement" },
      500
    );
  }
});

// PATCH /api/admin/announcements/:id/toggle
adminRoute.patch("/announcements/:id/toggle", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const announcement = await prisma.announcement.findUnique({ where: { id } });
    if (!announcement) {
      return c.json({ success: false, error: "Announcement not found" }, 404);
    }
    const nextActive = body.active !== undefined ? Boolean(body.active) : !announcement.active;
    const updated = await prisma.announcement.update({
      where: { id },
      data: { active: nextActive },
    });

    await Promise.all([
      invalidateCachePattern("admin:announcements:*"),
      invalidateCachePattern("staff:home:*"),
    ]).catch(() => {});

    return c.json({ success: true, data: updated });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to toggle announcement" }, 500);
  }
});

// Schedule Management for Admin
// GET /api/admin/schedule
adminRoute.get("/schedule", async (c) => {
  try {
    await ensureAdminNaSchedule(8);

    const monthQuery = c.req.query("month");
    const yearQuery = c.req.query("year");
    const startQuery = c.req.query("start");
    const endQuery = c.req.query("end");

    const cacheKey = `admin:schedule:${monthQuery || "all"}:${yearQuery || "all"}:${startQuery || "none"}:${endQuery || "none"}`;

    const events = await getOrSetCache(cacheKey, 120, async () => {
      let whereClause: any = {};
      if (startQuery && endQuery) {
        whereClause.start = { gte: new Date(startQuery), lte: new Date(endQuery) };
      } else if (monthQuery || yearQuery) {
        const { startDate, endDate } = getVietnamMonthRange(
          monthQuery ? parseInt(monthQuery, 10) : undefined,
          yearQuery ? parseInt(yearQuery, 10) : undefined
        );
        whereClause.start = { gte: startDate, lte: endDate };
      } else {
        const today = new Date();
        const startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        whereClause.start = { gte: startDate };
      }

      const shifts = await prisma.workShift.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
              email: true,
              role: true,
              employmentType: true,
            },
          },
          duties: true,
        },
        orderBy: { start: "asc" },
      });

      return shifts.map((s: any) => ({
        id: s.id,
        title: s.user?.name || "Staff",
        start: s.start instanceof Date ? s.start.toISOString() : new Date(s.start).toISOString(),
        end: s.end instanceof Date ? s.end.toISOString() : new Date(s.end).toISOString(),
        userId: s.userId,
        user: s.user,
        employmentType: s.user?.employmentType || "PART_TIME",
        duties: s.duties || [],
        isSenior: Boolean(s.isSenior),
        isOpenForSwap: Boolean(s.isOpenForSwap),
        shiftType: s.shiftType,
        status: s.status,
      }));
    });

    return c.json({ success: true, data: events });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to fetch schedule" }, 500);
  }
});

// POST /api/admin/schedule
adminRoute.post("/schedule", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { userId, start, end, shiftType, isSenior, skipPenalty } = body;
    if (!userId || !start || !end) {
      return c.json({ success: false, error: "Thiếu thông tin ca trực" }, 400);
    }

    const startDate = new Date(start);
    const endDate = new Date(end);
    await assertPeriodOpen(startDate);
    const durationHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
    if (durationHours < 4) {
      return c.json({ success: false, error: "Thời gian làm việc tối thiểu 4 tiếng!" }, 400);
    }

    const shouldSkipPenalty = skipPenalty !== undefined ? Boolean(skipPenalty) : true;
    await applyLateSchedulePenalty(userId, startDate, shouldSkipPenalty);

    const shift = await prisma.workShift.create({
      data: {
        userId,
        start: startDate,
        end: endDate,
        shiftType: shiftType || "FULL",
        status: "APPROVED",
        isSenior: Boolean(isSenior),
      },
      include: {
        user: {
          select: { id: true, name: true, image: true, email: true, role: true, employmentType: true },
        },
        duties: true,
      },
    });

    const tokenPayload = c.get("user");
    await prisma.shiftAuditLog.create({
      data: {
        shiftId: shift.id,
        userId: shift.userId,
        action: "CREATE",
        changedById: tokenPayload?.id || userId,
        newStart: shift.start,
        newEnd: shift.end,
      },
    }).catch(() => {});

    if (typeof reconcileFalseLateSchedulePenalties === "function") {
      await reconcileFalseLateSchedulePenalties(userId).catch(() => {});
    }

    const event = {
      id: shift.id,
      title: shift.user?.name || "Staff",
      start: shift.start.toISOString(),
      end: shift.end.toISOString(),
      userId: shift.userId,
      user: shift.user,
      employmentType: shift.user?.employmentType || "PART_TIME",
      duties: shift.duties || [],
      isSenior: Boolean(shift.isSenior),
      isOpenForSwap: Boolean(shift.isOpenForSwap),
      shiftType: shift.shiftType,
      status: shift.status,
    };

    await Promise.all([
      invalidatePayrollCache(),
      invalidateShiftDutyCache(shift.userId, shift.id),
      invalidateCachePattern("admin:schedule:*"),
      invalidateCachePattern("admin:schedule:history:*"),
      invalidateCachePattern("staff:schedule:*"),
      invalidateCachePattern("shifts:*"),
    ]).catch(() => {});

    return c.json({ success: true, data: event, id: shift.id }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to create shift" }, 500);
  }
});



// POST /api/admin/schedule/reconcile-penalties
adminRoute.post("/schedule/reconcile-penalties", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { userId } = body;
    const result = await reconcileFalseLateSchedulePenalties(userId);
    return c.json({ success: true, ...result });
  } catch (error: any) {
    return c.json({ success: false, error: error?.message || "Failed to reconcile penalties" }, 500);
  }
});

// PUT /api/admin/schedule/:id
adminRoute.put("/schedule/:id", async (c) => {
  try {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return c.json({ success: false, error: "Invalid shift id" }, 400);

    const body = await c.req.json().catch(() => ({}));
    const { start, end, isSenior } = body;

    const existing = await prisma.workShift.findUnique({ where: { id } });
    if (!existing) return c.json({ success: false, error: "Ca làm không tồn tại" }, 404);

    await assertPeriodOpen(existing.start);
    if (start) await assertPeriodOpen(new Date(start));

    const updateData: any = {};
    if (start) updateData.start = new Date(start);
    if (end) updateData.end = new Date(end);
    if (isSenior !== undefined) updateData.isSenior = Boolean(isSenior);

    const updated = await prisma.workShift.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: { id: true, name: true, image: true, email: true, role: true, employmentType: true },
        },
        duties: true,
      },
    });

    const tokenPayload = c.get("user");
    await prisma.shiftAuditLog.create({
      data: {
        shiftId: id,
        userId: existing.userId,
        action: "UPDATE",
        changedById: tokenPayload?.id || existing.userId,
        oldStart: existing.start,
        oldEnd: existing.end,
        newStart: updated.start,
        newEnd: updated.end,
      },
    }).catch(() => {});

    const event = {
      id: updated.id,
      title: updated.user?.name || "Staff",
      start: updated.start.toISOString(),
      end: updated.end.toISOString(),
      userId: updated.userId,
      user: updated.user,
      employmentType: updated.user?.employmentType || "PART_TIME",
      duties: updated.duties || [],
      isSenior: Boolean(updated.isSenior),
      isOpenForSwap: Boolean(updated.isOpenForSwap),
      shiftType: updated.shiftType,
      status: updated.status,
    };

    await Promise.all([
      invalidatePayrollCache(),
      invalidateShiftDutyCache(existing.userId, id),
      invalidateCachePattern("admin:schedule:*"),
      invalidateCachePattern("admin:schedule:history:*"),
      invalidateCachePattern("staff:schedule:*"),
      invalidateCachePattern("shifts:*"),
    ]).catch(() => {});

    return c.json({ success: true, data: event });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to update shift" }, 500);
  }
});

// DELETE /api/admin/schedule/:id
adminRoute.delete("/schedule/:id", async (c) => {
  try {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return c.json({ success: false, error: "Invalid shift id" }, 400);

    const existing = await prisma.workShift.findUnique({ where: { id } });
    if (!existing) return c.json({ success: false, error: "Ca làm không tồn tại" }, 404);

    await assertPeriodOpen(existing.start);

    const tokenPayload = c.get("user");
    await prisma.shiftAuditLog.create({
      data: {
        shiftId: id,
        userId: existing.userId,
        action: "DELETE",
        changedById: tokenPayload?.id || existing.userId,
        oldStart: existing.start,
        oldEnd: existing.end,
      },
    }).catch(() => {});

    await prisma.workShift.delete({ where: { id } });

    await Promise.all([
      invalidatePayrollCache(),
      invalidateShiftDutyCache(existing.userId, id),
      invalidateCachePattern("admin:schedule:*"),
      invalidateCachePattern("admin:schedule:history:*"),
      invalidateCachePattern("staff:schedule:*"),
      invalidateCachePattern("shifts:*"),
    ]).catch(() => {});

    return c.json({ success: true, message: "Đã xóa ca trực" });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to delete shift" }, 500);
  }
});

// DELETE /api/admin/schedule/user/:userId/all & /api/admin/schedule/employee/:userId/all
const clearUserScheduleHandler = async (c: any) => {
  try {
    const userId = c.req.param("userId");
    if (!userId) {
      return c.json({ success: false, error: "Thiếu userId" }, 400);
    }

    if (prisma.shiftDuty?.deleteMany) {
      await prisma.shiftDuty.deleteMany({ where: { userId } }).catch(() => {});
    }

    const deleteRes = await prisma.workShift.deleteMany({ where: { userId } });
    const deletedCount = deleteRes.count;

    await Promise.all([
      invalidatePayrollCache(),
      invalidateCachePattern("shifts:*"),
      invalidateCachePattern("admin:schedule:*"),
      invalidateCachePattern("admin:schedule:history:*"),
      invalidateCachePattern("staff:schedule:*"),
      invalidateShiftDutyCache(userId),
    ]).catch(() => {});

    return c.json({
      success: true,
      count: deletedCount,
      message: "Đã xóa toàn bộ ca làm việc của nhân viên",
    });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to delete shifts" }, 500);
  }
};

adminRoute.delete("/schedule/user/:userId/all", clearUserScheduleHandler);
adminRoute.delete("/schedule/employee/:userId/all", clearUserScheduleHandler);

// PATCH /api/admin/schedule/:id/senior
adminRoute.patch("/schedule/:id/senior", async (c) => {
  try {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return c.json({ success: false, error: "Invalid shift id" }, 400);

    const body = await c.req.json().catch(() => ({}));
    const isSenior = Boolean(body.isSenior);

    const shift = await prisma.workShift.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!shift) return c.json({ success: false, error: "Ca làm không tồn tại" }, 404);

    await assertPeriodOpen(shift.start);

    const unsetShiftIds: number[] = [];
    const tokenPayload = c.get("user");

    if (isSenior) {
      const overlappingSeniors = await prisma.workShift.findMany({
        where: {
          id: { not: id },
          isSenior: true,
          start: { lt: shift.end },
          end: { gt: shift.start },
        },
      });

      for (const os of overlappingSeniors) {
        unsetShiftIds.push(os.id);
        await prisma.workShift.update({
          where: { id: os.id },
          data: { isSenior: false },
        });
        await prisma.shiftAuditLog.create({
          data: {
            shiftId: os.id,
            userId: os.userId,
            action: "UPDATE",
            changedById: tokenPayload?.id || shift.userId,
            newStart: os.start,
            newEnd: os.end,
          },
        }).catch(() => {});
      }
    }

    const updated = await prisma.workShift.update({
      where: { id },
      data: { isSenior },
      include: {
        user: {
          select: { id: true, name: true, image: true, email: true, role: true, employmentType: true },
        },
        duties: true,
      },
    });

    await prisma.shiftAuditLog.create({
      data: {
        shiftId: shift.id,
        userId: shift.userId,
        action: "UPDATE",
        changedById: tokenPayload?.id || shift.userId,
        newStart: shift.start,
        newEnd: shift.end,
      },
    }).catch(() => {});

    const shiftUserName = shift.user?.name || shift.user?.email || "Nhân viên";
    const message = isSenior
      ? `Đã gán ${shiftUserName} làm Trưởng ca (+3k/h)!`
      : `Đã hủy vai trò Trưởng ca của ${shiftUserName}.`;

    await Promise.all([
      invalidateShiftDutyCache(),
      invalidateCachePattern("payroll:*"),
      invalidateCachePattern("stats:*"),
      invalidateCachePattern("admin:schedule:*"),
      invalidateCachePattern("admin:schedule:history:*"),
    ]).catch(() => {});

    return c.json({ success: true, data: updated, isSenior, message, unsetShiftIds });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to update senior status" }, 500);
  }
});

// POST /api/admin/schedule/upload
adminRoute.post("/schedule/upload", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const shiftsParam = body.shifts || body.shiftsParam || (Array.isArray(body) ? body : []);
    const overrideExisting = body.overrideExisting !== false;

    if (!shiftsParam || shiftsParam.length === 0) {
      return c.json({ success: false, error: "Không có dữ liệu lịch làm để tải lên" }, 400);
    }

    const tokenPayload = c.get("user");
    const allUsers = await prisma.user.findMany({
      select: { id: true, name: true, email: true },
    });

    const createdShifts: Array<{ userId: string; start: Date; end: Date; status: string }> = [];
    const unrecognizedNames = new Set<string>();

    const isParsedItemFormat = shiftsParam[0] && "names" in shiftsParam[0];

    if (isParsedItemFormat) {
      const distinctDateStrings = Array.from(new Set(shiftsParam.map((s: any) => s.dateIso))) as string[];

      if (overrideExisting && distinctDateStrings.length > 0) {
        for (const ds of distinctDateStrings) {
          const dtStart = new Date(ds);
          const dtEnd = new Date(dtStart.getTime());
          dtEnd.setDate(dtEnd.getDate() + 1);

          await prisma.workShift.deleteMany({
            where: {
              start: { gte: dtStart, lt: dtEnd },
              OR: [{ shiftType: null }, { shiftType: { not: "FIXED" } }],
            },
          });
        }
      }

      for (const shift of shiftsParam) {
        const shiftDate = new Date(shift.dateIso);
        const start = new Date(shiftDate);
        start.setUTCHours(shift.startHour - 7, 0, 0, 0);

        const end = new Date(shiftDate);
        end.setUTCHours(shift.endHour - 7, 0, 0, 0);

        for (let name of shift.names) {
          name = (name || "").trim();
          if (!name) continue;

          const lowerName = name.toLowerCase();
          let matchedUser = allUsers.find((u) => {
            if (u.name) {
              const un = u.name.toLowerCase();
              return un === lowerName || un.includes(lowerName);
            }
            return false;
          });

          if (!matchedUser) {
            matchedUser = allUsers.find(
              (u) => u.email && u.email.split("@")[0].toLowerCase().includes(lowerName)
            );
          }

          if (matchedUser) {
            createdShifts.push({
              userId: matchedUser.id,
              start,
              end,
              status: "APPROVED",
            });
          } else {
            unrecognizedNames.add(name);
          }
        }
      }
    } else {
      for (const item of shiftsParam) {
        if (item.userId && item.start && item.end) {
          createdShifts.push({
            userId: item.userId,
            start: new Date(item.start),
            end: new Date(item.end),
            status: item.status || "APPROVED",
          });
        }
      }
    }

    if (createdShifts.length > 0) {
      for (const shiftData of createdShifts) {
        const newShift = await prisma.workShift.create({ data: shiftData });
        await prisma.shiftAuditLog.create({
          data: {
            shiftId: newShift.id,
            userId: newShift.userId,
            action: "IMPORT",
            changedById: tokenPayload?.id || newShift.userId,
            newStart: newShift.start,
            newEnd: newShift.end,
          },
        }).catch(() => {});
      }
    }

    let message = `Thành công! Đã lên lịch tự động ${createdShifts.length} ca làm.`;
    if (unrecognizedNames.size > 0) {
      message = `Đã xếp ${createdShifts.length} ca. Không tìm thấy nhân viên: ${Array.from(unrecognizedNames).join(", ")}`;
    }

    await Promise.all([
      invalidatePayrollCache(),
      invalidateShiftDutyCache(),
      invalidateCachePattern("admin:schedule:*"),
      invalidateCachePattern("admin:schedule:history:*"),
    ]).catch(() => {});

    return c.json({ success: true, message, count: createdShifts.length });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Lỗi khi tải lịch lên" }, 500);
  }
});

// GET /api/admin/schedule/history
adminRoute.get("/schedule/history", async (c) => {
  try {
    const page = parseInt(c.req.query("page") || "1", 10);
    const pageSize = parseInt(c.req.query("pageSize") || "50", 10);
    const startDate = c.req.query("startDate");
    const endDate = c.req.query("endDate");

    const where: any = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        if (endDate.length <= 10) end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const cacheKey = `admin:schedule:history:${page}:${pageSize}:${startDate || "all"}:${endDate || "all"}`;
    const result = await getOrSetCache(cacheKey, 60, async () => {
      const [logs, total] = await Promise.all([
        prisma.shiftAuditLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: pageSize,
          skip: (page - 1) * pageSize,
          include: {
            user: { select: { id: true, name: true, email: true } },
            changedBy: { select: { id: true, name: true, email: true } },
          },
        }),
        prisma.shiftAuditLog.count({ where }),
      ]);
      return { logs, total };
    });

    return c.json({ success: true, data: result.logs, logs: result.logs, total: result.total });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to fetch shift history" }, 500);
  }
});

// GET /api/admin/schedule/:id/duties
adminRoute.get("/schedule/:id/duties", async (c) => {
  try {
    const shiftId = parseInt(c.req.param("id"), 10);
    if (isNaN(shiftId)) return c.json({ success: false, error: "Invalid shift id" }, 400);
    const cacheKey = `admin:schedule:duties:${shiftId}`;
    const duties = await getOrSetCache(cacheKey, 60, async () => {
      return await prisma.shiftDuty.findMany({
        where: { shiftId },
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
        orderBy: { createdAt: "asc" },
      });
    });
    return c.json({ success: true, data: duties });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to fetch duties" }, 500);
  }
});

// POST /api/admin/schedule/duties
adminRoute.post("/schedule/duties", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { title, description, userId, shiftId, date } = body;
    if (!title || !title.trim() || !userId) {
      return c.json({ success: false, error: "Tiêu đề và nhân viên không được để trống" }, 400);
    }
    const tokenPayload = c.get("user");
    const duty = await prisma.shiftDuty.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        userId,
        shiftId: shiftId ? parseInt(shiftId, 10) : null,
        createdById: tokenPayload?.id || tokenPayload?.sub || userId,
        date: date ? new Date(date) : new Date(),
      },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });
    await Promise.all([
      invalidateShiftDutyCache(),
      invalidateCachePattern("admin:schedule:*"),
      invalidateCachePattern("admin:schedule:duties:*"),
    ]).catch(() => {});
    return c.json({ success: true, data: duty }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to create duty" }, 500);
  }
});

// DELETE /api/admin/schedule/duties/:dutyId
adminRoute.delete("/schedule/duties/:dutyId", async (c) => {
  try {
    const dutyId = c.req.param("dutyId");
    await prisma.shiftDuty.delete({ where: { id: dutyId } });
    await Promise.all([
      invalidateShiftDutyCache(),
      invalidateCachePattern("admin:schedule:*"),
      invalidateCachePattern("admin:schedule:duties:*"),
    ]).catch(() => {});
    return c.json({ success: true, message: "Đã xóa nhiệm vụ" });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to delete duty" }, 500);
  }
});

// POST /api/admin/schedule/:id/swap & POST /api/admin/schedule/swap
const toggleSwapHandler = async (c: any) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const paramId = c.req.param("id");
    const rawId = paramId !== undefined ? paramId : (body.id ?? body.shiftId);
    const id = parseInt(String(rawId), 10);
    if (isNaN(id)) return c.json({ success: false, error: "Invalid shift id" }, 400);

    const existing = await prisma.workShift.findUnique({ where: { id } });
    if (!existing) return c.json({ success: false, error: "Ca làm không tồn tại" }, 404);
    await assertPeriodOpen(existing.start);
    const isOpen = body.isOpen !== undefined ? Boolean(body.isOpen) : !existing.isOpenForSwap;
    const updated = await prisma.workShift.update({
      where: { id },
      data: { isOpenForSwap: isOpen },
    });

    await Promise.all([
      invalidateShiftDutyCache(),
      invalidateCachePattern("admin:schedule:*"),
      invalidateCachePattern("shifts:*"),
    ]).catch(() => {});

    return c.json({ success: true, data: updated, isOpenForSwap: isOpen });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to toggle swap" }, 500);
  }
};

adminRoute.post("/schedule/:id/swap", toggleSwapHandler);
adminRoute.post("/schedule/swap", toggleSwapHandler);

// POST /api/admin/schedule/:id/take & POST /api/admin/schedule/take
const takeShiftHandler = async (c: any) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const paramId = c.req.param("id");
    const rawId = paramId !== undefined ? paramId : (body.id ?? body.shiftId);
    const id = parseInt(String(rawId), 10);
    if (isNaN(id)) return c.json({ success: false, error: "Invalid shift id" }, 400);

    const tokenPayload = c.get("user");
    const existing = await prisma.workShift.findUnique({ where: { id } });
    if (!existing) return c.json({ success: false, error: "Ca làm không tồn tại" }, 404);
    await assertPeriodOpen(existing.start);
    const newUserId = (tokenPayload?.sub || tokenPayload?.id) || existing.userId;
    const updatedResult = await prisma.workShift.updateMany({
      where: { id },
      data: { userId: newUserId, isOpenForSwap: false },
    });
    if (updatedResult.count === 0) {
      return c.json({ success: false, error: "Ca làm việc đã có người khác nhận hoặc không còn mở pass ca!" }, 409);
    }
    const updated = await prisma.workShift.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, image: true, email: true } },
      },
    });
    await prisma.shiftAuditLog.create({
      data: {
        shiftId: id,
        userId: newUserId,
        action: "TAKE_SWAP",
        changedById: newUserId,
        oldStart: existing.start,
        oldEnd: existing.end,
        newStart: existing.start,
        newEnd: existing.end,
      },
    }).catch(() => {});

    await Promise.all([
      invalidateShiftDutyCache(),
      invalidateCachePattern("payroll:*"),
      invalidateCachePattern("stats:*"),
      invalidateCachePattern("admin:schedule:*"),
      invalidateCachePattern("admin:schedule:history:*"),
      invalidateCachePattern("shifts:*"),
    ]).catch(() => {});

    return c.json({ success: true, data: updated, message: "Đã nhận ca thành công!" });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to take shift" }, 500);
  }
};

adminRoute.post("/schedule/:id/take", takeShiftHandler);
adminRoute.post("/schedule/take", takeShiftHandler);

// ============================================================================
// 7. BATCH CLOSE SHIFTS
// ============================================================================
// POST /api/admin/close-all-shifts
adminRoute.post("/close-all-shifts", async (c) => {
  try {
    const { startOfDay, endOfDay } = getVietnamDayRange();
    const checkins = await prisma.checkIn.findMany({
      where: { timestamp: { gte: startOfDay, lte: endOfDay } },
    });

    const userCheckins: Record<string, { hasIn: boolean; hasOut: boolean }> = {};
    for (const ch of checkins) {
      if (!userCheckins[ch.userId]) {
        userCheckins[ch.userId] = { hasIn: false, hasOut: false };
      }
      if (ch.type === "checkin") userCheckins[ch.userId].hasIn = true;
      if (ch.type === "checkout") userCheckins[ch.userId].hasOut = true;
    }

    const usersNeedingCheckout = Object.keys(userCheckins).filter(
      (uid) => userCheckins[uid].hasIn && !userCheckins[uid].hasOut
    );

    const now = new Date();
    for (const userId of usersNeedingCheckout) {
      await prisma.checkIn.create({
        data: {
          userId,
          type: "checkout",
          timestamp: now,
          ipAddress: "Manual",
          note: "Admin đóng ca tự động cuối ngày",
        },
      });
    }

    await Promise.all([
      invalidateCachePattern("payroll:*"),
      invalidateCachePattern("stats:*"),
      invalidateCachePattern("checkin:status:*"),
      invalidateCachePattern("admin:dashboard*"),
      invalidateCachePattern("admin:reports:*"),
      invalidateCachePattern("staff:history:*"),
      invalidateCachePattern("staff:payroll:*"),
      invalidateCachePattern("staff:rewards:leaderboard:*"),
    ]).catch(() => {});

    return c.json({
      success: true,
      message: `Đã đóng ca tự động cho ${usersNeedingCheckout.length} nhân sự`,
      count: usersNeedingCheckout.length,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to close shifts" },
      500
    );
  }
});

// ============================================================================
// 8. PAYROLL ADJUSTMENTS & BONUS CONFIG
// ============================================================================
// POST /api/admin/adjustments
adminRoute.post("/adjustments", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { userId, amount, reason } = body;
    if (!userId || amount === undefined || !reason) {
      return c.json(
        { success: false, error: "userId, amount and reason are required" },
        400
      );
    }

    const targetDate = body.date ? new Date(body.date) : new Date();
    await assertPeriodOpen(targetDate);

    const adjustment = await prisma.payrollAdjustment.create({
      data: {
        userId,
        amount: Math.round(Number(amount)),
        reason: String(reason).trim(),
      },
    });

    await Promise.all([
      invalidateCachePattern("payroll:*"),
      invalidateCachePattern("stats:*"),
      invalidateCachePattern("stats:monthly:*"),
      invalidateCachePattern("admin:dashboard*"),
    ]).catch((e: any) => console.warn("[Cache Invalidation Warning]", e));

    return c.json({
      success: true,
      message: "Đã lưu điều chỉnh thành công",
      data: adjustment,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to add adjustment" },
      500
    );
  }
});

// GET /api/admin/payroll and GET /api/admin/payroll/summary
const payrollSummaryHandler = async (c: any) => {
  try {
    const month = parseInt(c.req.query("month") || "", 10) || new Date().getMonth() + 1;
    const year = parseInt(c.req.query("year") || "", 10) || new Date().getFullYear();

    const cacheKey = `admin:payroll:${month}:${year}`;
    const result = await getOrSetCache(cacheKey, 60, async () => {
      const { startDate, endDate } = getVietnamMonthRange(month, year);

      const [users, period] = await Promise.all([
        prisma.user.findMany({
          where: {
            OR: [
              { isActive: true },
              { shifts: { some: { start: { gte: startDate, lte: endDate } } } },
              { checkins: { some: { timestamp: { gte: startDate, lte: endDate } } } },
              { adjustments: { some: { date: { gte: startDate, lte: endDate } } } },
            ],
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            hourlyRate: true,
            monthlySalary: true,
            employmentType: true,
            adjustments: {
              where: { date: { gte: startDate, lte: endDate } },
              orderBy: { date: "desc" },
            },
          },
          orderBy: { name: "asc" },
        }),
        prisma.payrollPeriod.findUnique({
          where: { month_year: { month, year } },
        }),
      ]);

      const isPeriodClosed = period?.status === "CLOSED";

      if (isPeriodClosed) {
        const cacheKey = `admin:payroll:closed-payslips:${month}:${year}`;
        const payslips = await getOrSetCache(cacheKey, 300, async () => {
          return await prisma.payslip.findMany({
            where: { month, year },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true,
                  isActive: true,
                  employmentType: true,
                  hourlyRate: true,
                  adjustments: {
                    where: { date: { gte: startDate, lte: endDate } },
                    orderBy: { date: "desc" },
                  },
                },
              },
            },
          });
        });

        if (payslips.length > 0) {
          const payrollItems = payslips.map((p) => {
            const content = (p.content as any) || {};
            return {
              id: p.userId,
              name: p.user.name,
              email: p.user.email,
              role: p.user.role,
              isActive: p.user.isActive ?? true,
              stats: content,
              recentAdjustments: (p.user.adjustments || []).map((a: any) => ({
                id: a.id,
                amount: a.amount,
                reason: a.reason,
                date: a.date ? new Date(a.date).toISOString() : new Date().toISOString(),
              })),
              userId: p.userId,
              userName: p.user.name,
              userEmail: p.user.email,
              department: (content.employmentType || p.user.employmentType) === "FULL_TIME" ? "Toàn thời gian" : "Bán thời gian",
              month,
              year,
              standardHours: 176,
              actualHours: content.totalHours || 0,
              overtimeHours: Math.max(0, (content.totalHours || 0) - 176),
              hourlyRate: content.hourlyRate || p.user.hourlyRate || 0,
              baseSalary: content.baseSalary || 0,
              bonus: content.bonusAmount || 0,
              allowance: 0,
              penalty: content.latePenaltyAmount || 0,
              totalSalary: content.totalSalary || 0,
              isPaid: true,
              emailSentAt: p.emailSentAt,
            };
          });

          return {
            data: payrollItems,
            isClosed: true,
            period,
            bonusPercent: period?.bonusPercent || 0,
            bonusTargets: (period?.bonusTargets as string[]) || ["PART_TIME"],
            excludedBonusUsers: (period?.excludedBonusUsers as string[]) || [],
          };
        }
      }

      const targetDate = new Date(year, month - 1, 15);

      const payrollItems = await Promise.all(
        users.map(async (u) => {
          const stats = await calculateUserMonthlyStats(u.id, targetDate).catch(() => null);

          const standardHours = 176;
          const actualHours = stats?.totalHours || 0;
          const overtimeHours = stats ? Math.max(0, actualHours - standardHours) : 0;
          const hourlyRate = stats?.hourlyRate || u.hourlyRate || 0;
          const baseSalary = stats?.baseSalary || 0;
          const bonusTargets = (period?.bonusTargets as string[]) || ["PART_TIME"];
          const excludedBonusUsers = (period?.excludedBonusUsers as string[]) || [];
          const isThuKpiSalary =
            (u.email === "cuccung123456789@gmail.com" || u.name === "Thư") &&
            (year > 2026 || (year === 2026 && month >= 6));
          const shouldApplyBonus =
            Boolean(period?.bonusPercent) &&
            (bonusTargets.includes(stats?.employmentType || u.employmentType) ||
              (isThuKpiSalary && bonusTargets.includes("PART_TIME"))) &&
            !excludedBonusUsers.includes(u.id);
          const bonus = shouldApplyBonus && period?.bonusPercent ? Math.round(baseSalary * (period.bonusPercent / 100)) : 0;
          const allowance = 0;
          const penalty = stats?.latePenaltyAmount || 0;
          const preBonusTotalSalary = stats?.totalSalary ?? (baseSalary - penalty);

          return {
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            isActive: u.isActive ?? true,
            stats: {
              ...(stats || {}),
              employmentType: stats?.employmentType || u.employmentType,
              baseSalary: stats?.baseSalary || 0,
              totalSalary: preBonusTotalSalary, // Pre-bonus salary to avoid double bonus!
              hourlyRate: stats?.hourlyRate || u.hourlyRate || 0,
              dynamicHourlyRate: stats?.dynamicHourlyRate || stats?.hourlyRate || u.hourlyRate || 0,
              daysWorked: stats?.daysWorked || 0,
              standardDays: stats?.standardDays || 26,
              leaveCount: stats?.leaveCount || 0,
              deduction: stats?.deduction || 0,
              totalHours: stats?.totalHours || 0,
              bonusAmount: bonus,
              finalNet: preBonusTotalSalary + bonus,
              adjustments: stats?.adjustments || (u.adjustments || []).map((a: any) => ({
                ...a,
                date: a.date ? new Date(a.date).toISOString() : new Date().toISOString(),
              })),
            },
            recentAdjustments: (u.adjustments || []).map((a: any) => ({
              id: a.id,
              amount: a.amount,
              reason: a.reason,
              date: a.date ? new Date(a.date).toISOString() : new Date().toISOString(),
            })),
            // Flat fields for backwards compatibility:
            userId: u.id,
            userName: u.name,
            userEmail: u.email,
            department: (stats?.employmentType || u.employmentType) === "FULL_TIME" ? "Toàn thời gian" : "Bán thời gian",
            month,
            year,
            standardHours,
            actualHours,
            overtimeHours,
            hourlyRate,
            baseSalary,
            bonus,
            allowance,
            penalty,
            totalSalary: preBonusTotalSalary,
            isPaid: isPeriodClosed,
          };
        })
      );

      // Apply Top 1 Hardworking Bonus (+200k) from @checkin/shared (BUG-PAY-04)
      const itemsWithBonus = applyHardworkingBonus(payrollItems, month, year, true);

      const finalPayrollItems = itemsWithBonus.map((item) => {
        const stats = item.stats || {};
        return {
          ...item,
          totalSalary: stats.totalSalary !== undefined ? stats.totalSalary : item.totalSalary,
        };
      });

      return {
        data: finalPayrollItems,
        isClosed: isPeriodClosed,
        period,
        bonusPercent: period?.bonusPercent || 0,
        bonusTargets: (period?.bonusTargets as string[]) || ["PART_TIME"],
        excludedBonusUsers: (period?.excludedBonusUsers as string[]) || [],
      };
    });

    return c.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to load payroll" },
      500
    );
  }
};
adminRoute.get("/payroll", payrollSummaryHandler);
adminRoute.get("/payroll/summary", payrollSummaryHandler);

// GET /api/admin/payroll/:userId
adminRoute.get("/payroll/:userId", async (c) => {
  try {
    const userId = c.req.param("userId");
    const now = new Date();
    const month = parseInt(c.req.query("month") || "", 10) || now.getMonth() + 1;
    const year = parseInt(c.req.query("year") || "", 10) || now.getFullYear();
    const targetDate = new Date(year, month - 1, 1);

    const cacheKey = `admin:payroll-user:${userId}:${month}:${year}`;
    const result = await getOrSetCache(
      cacheKey,
      (data) => (data?.isClosed && data?.payslip ? 300 : 60),
      async () => {
      const [user, period, payslip] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId } }),
        prisma.payrollPeriod.findUnique({
          where: { month_year: { month, year } },
        }),
        prisma.payslip.findUnique({
          where: { userId_month_year: { userId, month, year } },
        }),
      ]);

      if (!user) {
        return null;
      }

      const isClosed = period?.status === "CLOSED" && !!payslip;
      let stats: any;

      if (isClosed && payslip) {
        stats = payslip.content;
      } else {
        const liveStats = await calculateUserMonthlyStats(userId, targetDate);
        const bonusPercent = period?.bonusPercent || 0;
        const bonusTargets = (period?.bonusTargets as string[]) || ["PART_TIME"];
        const excludedBonusUsers = (period?.excludedBonusUsers as string[]) || [];
        const isThuKpiSalary =
          (user.email === "cuccung123456789@gmail.com" || user.name === "Thư") &&
          (year > 2026 || (year === 2026 && month >= 6));
        const shouldApplyBonus =
          bonusPercent > 0 &&
          (bonusTargets.includes(user.employmentType) || (isThuKpiSalary && bonusTargets.includes("PART_TIME"))) &&
          !excludedBonusUsers.includes(user.id);
        const bonusAmount =
          shouldApplyBonus && liveStats
            ? Math.round((liveStats.baseSalary || 0) * (bonusPercent / 100))
            : 0;
        const finalNet = (liveStats?.totalSalary || 0) + bonusAmount;

        stats = {
          ...liveStats,
          bonusPercent: shouldApplyBonus ? bonusPercent : 0,
          bonusAmount,
          finalNet,
        };
      }

      return {
        user,
        period,
        payslip,
        stats,
        isClosed,
      };
    });

    if (!result || !result.user) {
      return c.json({ success: false, error: "Không tìm thấy nhân viên" }, 404);
    }

    return c.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to load employee payroll" },
      500
    );
  }
});

// ============================================================================
// TASKS & TASK DEFINITIONS MANAGEMENT
// ============================================================================
// Task Definitions
adminRoute.get("/tasks/definitions", getDefinitionsHandler);
adminRoute.post("/tasks/definitions", createDefinitionHandler);
adminRoute.patch("/tasks/definitions/:id", updateDefinitionHandler);
adminRoute.delete("/tasks/definitions/:id", deleteDefinitionHandler);

// Task Items (Marketplace)
adminRoute.get("/tasks/items", getTaskItemsHandler);
adminRoute.post("/tasks/items", createTaskItemHandler);
adminRoute.patch("/tasks/items/:id", updateTaskItemHandler);
adminRoute.patch("/tasks/items/:id/status", updateTaskItemStatusHandler);
adminRoute.post("/tasks/items/:id/reset", resetTaskItemHandler);
adminRoute.post("/tasks/items/:id/close", closeTaskItemHandler);
adminRoute.delete("/tasks/items/:id", deleteTaskItemHandler);

// GET /api/admin/tasks
adminRoute.get("/tasks", async (c) => {
  try {
    const formattedTasks = await getOrSetCache("admin:tasks:all", 60, async () => {
      const tasks = await (prisma as any).userTask.findMany({
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true },
          },
          taskDefinition: true,
          taskItem: true,
        },
        orderBy: { createdAt: "desc" },
      });

      return tasks.map((t: any) => ({
        id: t.id,
        userId: t.userId,
        user: {
          id: t.user?.id,
          name: t.user?.name,
          email: t.user?.email,
          image: t.user?.image,
        },
        title: t.taskItem?.title || t.taskDefinition?.name || t.note || "Nhiệm vụ được giao",
        type: t.taskDefinition?.type || "PACKAGING",
        unit: t.taskDefinition?.unit || "điểm",
        taskDefinition: t.taskDefinition
          ? {
              id: t.taskDefinition.id,
              name: t.taskDefinition.name,
              unit: t.taskDefinition.unit,
              baseReward: t.taskDefinition.baseReward,
            }
          : undefined,
        taskItem: t.taskItem
          ? {
              id: t.taskItem.id,
              title: t.taskItem.title,
            }
          : undefined,
        quantity: t.quantity ?? 1,
        ratePerUnit: t.unitPrice ?? t.taskDefinition?.baseReward ?? 0,
        totalReward:
          t.finalAmount != null
            ? t.finalAmount
            : (t.quantity || 1) * (t.unitPrice || 0) + (t.bonusPenalty || 0),
        bonusPenalty: t.bonusPenalty ?? 0,
        adminNote: t.adminNote ?? null,
        proofUrl: t.evidenceLink,
        evidenceLink: t.evidenceLink,
        notes: t.note,
        note: t.note,
        status: t.status,
        startedAt: t.startedAt ? (typeof t.startedAt === "string" ? t.startedAt : t.startedAt.toISOString()) : undefined,
        submittedAt: t.submittedAt ? (typeof t.submittedAt === "string" ? t.submittedAt : t.submittedAt.toISOString()) : (typeof t.createdAt === "string" ? t.createdAt : t.createdAt?.toISOString?.() ?? undefined),
        reviewedAt: t.reviewedAt ? (typeof t.reviewedAt === "string" ? t.reviewedAt : t.reviewedAt.toISOString()) : undefined,
      }));
    });

    return c.json({ success: true, data: formattedTasks });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to load tasks" },
      500
    );
  }
});

// POST & PATCH /api/admin/tasks/:id/approve
const approveTaskHandler = async (c: any) => {
  try {
    const id = c.req.param("id");
    const tokenPayload = c.get("user");
    const adminId = tokenPayload?.sub || tokenPayload?.id;
    const body = await c.req.json().catch(() => ({}));
    const bonusPenalty = typeof body.bonusPenalty === "number" ? body.bonusPenalty : 0;
    const adminNote = body.adminNote || null;

    const task = await (prisma as any).userTask.findUnique({
      where: { id },
      include: { taskDefinition: true, taskItem: true },
    });
    if (!task) return c.json({ success: false, error: "Task not found" }, 404);

    const baseAmount = (task.quantity || 1) * (task.unitPrice || 0);
    const calcAmount = Math.max(0, baseAmount + bonusPenalty);

    const updated = await (prisma as any).userTask.update({
      where: { id },
      data: {
        status: "APPROVED",
        reviewedAt: new Date(),
        reviewedBy: adminId,
        finalAmount: calcAmount,
        bonusPenalty,
        adminNote,
      },
    });

    if (calcAmount > 0) {
      const taskName = task.taskItem?.title || task.taskDefinition?.name || "Nhiệm vụ";
      const noteSuffix = task.note ? ` (${task.note})` : "";
      await prisma.payrollAdjustment.create({
        data: {
          userId: task.userId,
          amount: Math.round(calcAmount),
          reason: `[TASK] ${taskName} - ${task.quantity || 1}${noteSuffix}`,
          date: task.submittedAt || task.createdAt || new Date(),
        },
      });
    }

    await Promise.all([
      invalidatePayrollCache(),
      invalidateCachePattern("admin:tasks:*"),
      invalidateCachePattern("staff-tasks:stats:*"),
      invalidateCachePattern("user:tasks:my:*"),
      invalidateCachePattern("tasks:market:*"),
      invalidateCachePattern("staff:tasks:*"),
      invalidateCachePattern("task*"),
      invalidateCachePattern("staff:rewards:leaderboard:*"),
      invalidateTaskSummaryCache(),
    ]).catch(() => {});

    return c.json({ success: true, message: "Đã duyệt nhiệm vụ", data: updated });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to approve task" }, 500);
  }
};
adminRoute.post("/tasks/:id/approve", approveTaskHandler);
adminRoute.patch("/tasks/:id/approve", approveTaskHandler);

// POST & PATCH /api/admin/tasks/:id/reject
const rejectTaskHandler = async (c: any) => {
  try {
    const id = c.req.param("id");
    const tokenPayload = c.get("user");
    const adminId = tokenPayload?.sub || tokenPayload?.id;
    const body = await c.req.json().catch(() => ({}));
    const adminNote = body.reason || body.adminNote || "Từ chối";

    const task = await (prisma as any).userTask.findUnique({
      where: { id },
      include: { taskDefinition: true, taskItem: true },
    });
    if (!task) return c.json({ success: false, error: "Task not found" }, 404);

    const updated = await (prisma as any).userTask.update({
      where: { id },
      data: {
        status: "REJECTED",
        reviewedAt: new Date(),
        reviewedBy: adminId,
        finalAmount: 0,
        adminNote,
      },
    });

    if (task.status === "APPROVED") {
      const taskName = task.taskItem?.title || task.taskDefinition?.name || "Nhiệm vụ";
      const noteSuffix = task.note ? ` (${task.note})` : "";
      const expectedReason = `[TASK] ${taskName} - ${task.quantity || 1}${noteSuffix}`;
      const targetDate = task.submittedAt || task.createdAt;
      if (targetDate) {
        await prisma.payrollAdjustment.deleteMany({
          where: {
            userId: task.userId,
            reason: expectedReason,
            date: targetDate,
          },
        }).catch(() => {});
      }
    }

    await Promise.all([
      invalidatePayrollCache(),
      invalidateCachePattern("admin:tasks:*"),
      invalidateCachePattern("staff-tasks:stats:*"),
      invalidateCachePattern("user:tasks:my:*"),
      invalidateCachePattern("tasks:market:*"),
      invalidateCachePattern("staff:tasks:*"),
      invalidateCachePattern("task*"),
      invalidateCachePattern("staff:rewards:leaderboard:*"),
      invalidateTaskSummaryCache(),
    ]).catch(() => {});

    return c.json({ success: true, message: "Đã từ chối nhiệm vụ", data: updated });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to reject task" }, 500);
  }
};
adminRoute.post("/tasks/:id/reject", rejectTaskHandler);
adminRoute.patch("/tasks/:id/reject", rejectTaskHandler);

// POST & PATCH /api/admin/tasks/:id/review
const reviewTaskHandler = async (c: any) => {
  try {
    const id = c.req.param("id");
    const tokenPayload = c.get("user");
    const adminId = tokenPayload?.sub || tokenPayload?.id;
    const body = await c.req.json().catch(() => ({}));
    const decision = body.decision;
    if (decision !== "APPROVED" && decision !== "REJECTED") {
      return c.json({ success: false, error: "Decision must be APPROVED or REJECTED" }, 400);
    }

    const task = await (prisma as any).userTask.findUnique({
      where: { id },
      include: { taskDefinition: true, taskItem: true },
    });
    if (!task) return c.json({ success: false, error: "Task not found" }, 404);

    const bonusPenalty = typeof body.bonusPenalty === "number" ? body.bonusPenalty : 0;
    const adminNote = body.adminNote || body.reason || null;

    if (decision === "APPROVED") {
      const baseAmount = (task.quantity || 1) * (task.unitPrice || 0);
      const calcAmount = Math.max(0, baseAmount + bonusPenalty);

      const updated = await (prisma as any).userTask.update({
        where: { id },
        data: {
          status: "APPROVED",
          reviewedAt: new Date(),
          reviewedBy: adminId,
          finalAmount: calcAmount,
          bonusPenalty,
          adminNote,
        },
      });

      if (calcAmount > 0) {
        const taskName = task.taskItem?.title || task.taskDefinition?.name || "Nhiệm vụ";
        const noteSuffix = task.note ? ` (${task.note})` : "";
        await prisma.payrollAdjustment.create({
          data: {
            userId: task.userId,
            amount: Math.round(calcAmount),
            reason: `[TASK] ${taskName} - ${task.quantity || 1}${noteSuffix}`,
            date: task.submittedAt || task.createdAt || new Date(),
          },
        });
      }

      await Promise.all([
        invalidatePayrollCache(),
        invalidateCachePattern("admin:tasks:*"),
        invalidateCachePattern("staff-tasks:stats:*"),
        invalidateCachePattern("user:tasks:my:*"),
        invalidateCachePattern("tasks:market:*"),
        invalidateCachePattern("staff:tasks:*"),
        invalidateCachePattern("task*"),
        invalidateCachePattern("staff:rewards:leaderboard:*"),
        invalidateTaskSummaryCache(),
      ]).catch(() => {});

      return c.json({ success: true, message: "Đã duyệt nhiệm vụ", data: updated });
    } else {
      const updated = await (prisma as any).userTask.update({
        where: { id },
        data: {
          status: "REJECTED",
          reviewedAt: new Date(),
          reviewedBy: adminId,
          finalAmount: 0,
          adminNote: adminNote || "Từ chối",
        },
      });

      if (task.status === "APPROVED") {
        const taskName = task.taskItem?.title || task.taskDefinition?.name || "Nhiệm vụ";
        const noteSuffix = task.note ? ` (${task.note})` : "";
        const expectedReason = `[TASK] ${taskName} - ${task.quantity || 1}${noteSuffix}`;
        const targetDate = task.submittedAt || task.createdAt;
        if (targetDate) {
          await prisma.payrollAdjustment.deleteMany({
            where: {
              userId: task.userId,
              reason: expectedReason,
              date: targetDate,
            },
          }).catch(() => {});
        }
      }

      await Promise.all([
        invalidatePayrollCache(),
        invalidateCachePattern("admin:tasks:*"),
        invalidateCachePattern("staff-tasks:stats:*"),
        invalidateCachePattern("user:tasks:my:*"),
        invalidateCachePattern("tasks:market:*"),
        invalidateCachePattern("staff:tasks:*"),
        invalidateCachePattern("task*"),
        invalidateCachePattern("staff:rewards:leaderboard:*"),
        invalidateTaskSummaryCache(),
      ]).catch(() => {});

      return c.json({ success: true, message: "Đã từ chối nhiệm vụ", data: updated });
    }
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to review task" }, 500);
  }
};
adminRoute.post("/tasks/:id/review", reviewTaskHandler);
adminRoute.patch("/tasks/:id/review", reviewTaskHandler);

// DELETE & POST /api/admin/tasks/stale-pending (Delete stale unapproved tasks from Feb-May)
const stalePendingHandler = async (c: any) => {
  try {
    const beforeDate = c.req.query("before") || "2026-06-01T00:00:00.000Z";
    const dateLimit = new Date(beforeDate);

    const deleted = await prisma.userTask.deleteMany({
      where: {
        status: { in: ["PENDING", "SUBMITTED"] },
        createdAt: { lt: dateLimit },
      },
    });

    await Promise.all([
      invalidateCachePattern("task*"),
      invalidateCachePattern("admin:tasks:*"),
      invalidateCachePattern("staff-tasks:stats:*"),
      invalidateCachePattern("staff:tasks:*"),
      invalidateCachePattern("staff:rewards:leaderboard:*"),
      invalidateTaskSummaryCache(),
    ]).catch(() => {});
    return c.json({
      success: true,
      message: `Đã xóa ${deleted.count} task cũ trước tháng 6/2026 thành công`,
      count: deleted.count,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to cleanup stale tasks" },
      500
    );
  }
};
adminRoute.delete("/tasks/stale-pending", stalePendingHandler);
adminRoute.post("/tasks/stale-pending", stalePendingHandler);

// DELETE /api/admin/tasks/:id
const deleteTaskHandler = async (c: any) => {
  try {
    const id = c.req.param("id");
    const task = await prisma.userTask.findUnique({ where: { id } });
    if (!task) {
      return c.json({ success: false, error: "Task not found" }, 404);
    }

    await prisma.userTask.delete({ where: { id } });
    await Promise.all([
      invalidateCachePattern("task*"),
      invalidateCachePattern("admin:tasks:*"),
      invalidateCachePattern("staff-tasks:stats:*"),
      invalidateCachePattern("staff:tasks:*"),
      invalidateCachePattern("staff:rewards:leaderboard:*"),
      invalidateTaskSummaryCache(),
    ]).catch(() => {});

    return c.json({ success: true, message: "Đã xóa nhiệm vụ thành công" });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to delete task" },
      500
    );
  }
};
adminRoute.delete("/tasks/:id", deleteTaskHandler);

// ============================================================================
// LUCKY WHEEL MANAGEMENT
// ============================================================================
// GET /api/admin/lucky-wheel
adminRoute.get("/lucky-wheel", async (c) => {
  try {
    const cacheKey = "admin:lucky-wheel:all";
    const result = await getOrSetCache(cacheKey, 60, async () => {
      const [prizes, history] = await Promise.all([
        prisma.luckyWheelPrize.findMany({
          orderBy: { createdAt: "asc" },
        }),
        prisma.luckyWheelHistory.findMany({
          take: 100,
          orderBy: { createdAt: "desc" },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                image: true,
              },
            },
          },
        }),
      ]);
      return { prizes, history };
    });

    return c.json({
      success: true,
      data: result,
      prizes: result.prizes,
      history: result.history,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to load lucky wheel data" },
      500
    );
  }
});

// POST /api/admin/lucky-wheel/prizes
adminRoute.post("/lucky-wheel/prizes", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { name, description, value, type, quantity, remaining, probability, active } = body;
    if (!name) return c.json({ success: false, error: "Name is required" }, 400);

    const prize = await prisma.luckyWheelPrize.create({
      data: {
        name,
        description: description || null,
        value: Number(value) || 0,
        type: type || "PHYSICAL",
        quantity: Number(quantity) || 0,
        remaining: remaining !== undefined ? Number(remaining) : Number(quantity) || 0,
        probability: Number(probability) || 0,
        active: active !== undefined ? Boolean(active) : true,
      },
    });

    await Promise.all([
      invalidateCachePattern("meta:lucky-wheel:*"),
      invalidateCachePattern("admin:lucky-wheel:*"),
    ]).catch(() => {});

    return c.json({ success: true, data: prize }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to create prize" }, 500);
  }
});

// PUT /api/admin/lucky-wheel/prizes/:id
adminRoute.put("/lucky-wheel/prizes/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const { name, description, value, type, quantity, remaining, probability, active } = body;
    const updated = await prisma.luckyWheelPrize.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(value !== undefined && { value: Number(value) }),
        ...(type !== undefined && { type }),
        ...(quantity !== undefined && { quantity: Number(quantity) }),
        ...(remaining !== undefined && { remaining: Number(remaining) }),
        ...(probability !== undefined && { probability: Number(probability) }),
        ...(active !== undefined && { active: Boolean(active) }),
      },
    });

    await Promise.all([
      invalidateCachePattern("meta:lucky-wheel:*"),
      invalidateCachePattern("admin:lucky-wheel:*"),
    ]).catch(() => {});

    return c.json({ success: true, data: updated });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to update prize" }, 500);
  }
});

// DELETE /api/admin/lucky-wheel/prizes/:id
adminRoute.delete("/lucky-wheel/prizes/:id", async (c) => {
  try {
    const id = c.req.param("id");
    await prisma.luckyWheelPrize.delete({ where: { id } });

    await Promise.all([
      invalidateCachePattern("meta:lucky-wheel:*"),
      invalidateCachePattern("admin:lucky-wheel:*"),
    ]).catch(() => {});

    return c.json({ success: true, message: "Prize deleted" });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to delete prize" }, 500);
  }
});

// POST /api/admin/lucky-wheel/allowed/all
adminRoute.post("/lucky-wheel/allowed/all", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const allowed = body.allowed !== undefined ? Boolean(body.allowed) : true;

    await prisma.user.updateMany({
      data: { luckyWheelAllowed: allowed },
    });

    await Promise.all([
      invalidateCachePattern("admin:employees:*"),
      invalidateCachePattern("user:me:*"),
      invalidateCachePattern("lucky-wheel:status:*"),
    ]).catch(() => {});

    return c.json({
      success: true,
      message: `Đã ${allowed ? "bật" : "tắt"} quyền quay cho toàn bộ nhân sự!`,
    });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to update permissions" }, 500);
  }
});

// PATCH /api/admin/lucky-wheel/allowed/:userId
adminRoute.patch("/lucky-wheel/allowed/:userId", async (c) => {
  try {
    const userId = c.req.param("userId");
    const body = await c.req.json().catch(() => ({}));
    const allow = body.allow !== undefined ? Boolean(body.allow) : true;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { luckyWheelAllowed: allow },
      select: { id: true, name: true, luckyWheelAllowed: true },
    });

    await Promise.all([
      invalidateCachePattern("admin:employees:*"),
      invalidateCachePattern("user:me:" + userId),
      invalidateCachePattern(`lucky-wheel:status:${userId}:*`),
    ]).catch(() => {});

    return c.json({
      success: true,
      message: `Đã ${allow ? "bật" : "tắt"} quyền quay cho nhân sự!`,
      data: updated,
    });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to update user lucky wheel permission" }, 500);
  }
});

// POST /api/admin/payroll/bonus
adminRoute.post("/payroll/bonus", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { month, year, bonusPercent, targets, excludedBonusUsers } = body;
    if (!month || !year) {
      return c.json({ success: false, error: "month and year are required" }, 400);
    }

    const updated = await prisma.payrollPeriod.upsert({
      where: { month_year: { month, year } },
      create: {
        month,
        year,
        bonusPercent: Number(bonusPercent) || 0,
        bonusTargets: targets || ["PART_TIME"],
        excludedBonusUsers: excludedBonusUsers || [],
      },
      update: {
        bonusPercent: Number(bonusPercent) || 0,
        bonusTargets: targets || ["PART_TIME"],
        excludedBonusUsers: excludedBonusUsers || [],
      },
    });

    await Promise.all([
      invalidatePayrollCache(),
      invalidateCachePattern("payroll:*"),
      invalidateCachePattern("stats:*"),
      invalidateCachePattern("admin:dashboard*"),
      invalidateCachePattern("staff:payroll:*"),
      invalidateCachePattern("admin:payroll:closed-payslips:*"),
    ]).catch(() => {});

    return c.json({
      success: true,
      message: "Đã cập nhật cấu hình thưởng tháng",
      data: updated,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to update bonus" },
      500
    );
  }
});

// POST /api/admin/payroll/close
adminRoute.post("/payroll/close", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { month, year, bonusPercent, targets, excludedBonusUsers } = body;
    if (!month || !year) {
      return c.json({ success: false, error: "month and year are required" }, 400);
    }

    const result = await closePayrollMonth(
      Number(month),
      Number(year),
      Number(bonusPercent) || 0,
      targets || ["PART_TIME"],
      excludedBonusUsers || []
    );

    await Promise.all([
      invalidatePayrollCache(),
      invalidateCachePattern("admin:payroll:closed-payslips:*"),
    ]).catch(() => {});

    return c.json({
      success: true,
      message: result.message || "Đã chốt sổ bảng lương tháng thành công!",
      data: result.period,
      payslipsCount: result.payslipCount,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to close payroll" },
      500
    );
  }
});

// POST /api/admin/payroll/reopen
adminRoute.post("/payroll/reopen", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { month, year } = body;
    if (!month || !year) {
      return c.json({ success: false, error: "month and year are required" }, 400);
    }

    const updated = await prisma.payrollPeriod.update({
      where: { month_year: { month, year } },
      data: { status: "OPEN" },
    });

    await Promise.all([
      invalidatePayrollCache(),
      invalidateCachePattern("payroll:*"),
      invalidateCachePattern("stats:*"),
      invalidateCachePattern("admin:dashboard*"),
      invalidateCachePattern("staff:payroll:*"),
      invalidateCachePattern("admin:payroll:closed-payslips:*"),
    ]).catch(() => {});

    return c.json({
      success: true,
      message: "Đã mở lại sổ tính lương!",
      data: updated,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to reopen payroll" },
      500
    );
  }
});

// POST /api/admin/payroll/email/:userId
adminRoute.post("/payroll/email/:userId", async (c) => {
  try {
    const userId = c.req.param("userId");
    const body = await c.req.json().catch(() => ({}));
    const now = new Date();
    const month = parseInt(c.req.query("month") || body?.month || "", 10) || (now.getMonth() + 1);
    const year = parseInt(c.req.query("year") || body?.year || "", 10) || now.getFullYear();

    const payslip = await prisma.payslip.findUnique({
      where: { userId_month_year: { userId, month, year } },
      include: { user: true },
    });

    if (!payslip) {
      return c.json(
        { success: false, error: "Payslip chưa được chốt. Cần chốt bảng lương trước." },
        400
      );
    }

    if (!payslip.user?.email) {
      return c.json(
        { success: false, error: "Nhân viên chưa có email." },
        400
      );
    }

    const content = (payslip.content as any) || {};

    await sendPayslipEmail({
      employeeName: payslip.user.name ?? "Nhân viên",
      employeeEmail: payslip.user.email,
      month,
      year,
      stats: {
        totalHours: content?.totalHours,
        hourlyRate: content?.hourlyRate,
        monthlySalary: content?.monthlySalary,
        employmentType: content?.employmentType,
        totalTaskIncome: content?.totalTaskIncome,
        totalAdjustments: content?.totalAdjustments,
        positiveAdjustments: Array.isArray(content?.adjustments)
          ? content.adjustments.filter((a: any) => a.amount > 0).reduce((sum: number, a: any) => sum + a.amount, 0)
          : 0,
        negativeAdjustments: Array.isArray(content?.adjustments)
          ? content.adjustments.filter((a: any) => a.amount < 0).reduce((sum: number, a: any) => sum + Math.abs(a.amount), 0)
          : 0,
        netSalary: payslip.netSalary,
        bonusAmount: content?.bonusAmount,
        lateCount: content?.lateCount,
        latePenaltyHours: content?.latePenaltyHours,
        latePenaltyAmount: content?.latePenaltyAmount,
      },
    });

    await prisma.payslip.update({
      where: { userId_month_year: { userId, month, year } },
      data: { emailSentAt: new Date() },
    });

    await invalidateCachePattern("payroll:*");

    return c.json({
      success: true,
      message: "Đã gửi phiếu lương thành công",
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Gửi email thất bại" },
      500
    );
  }
});

// POST /api/admin/payroll/email-all
adminRoute.post("/payroll/email-all", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const now = new Date();
    const month = parseInt(body?.month || c.req.query("month") || "", 10) || (now.getMonth() + 1);
    const year = parseInt(body?.year || c.req.query("year") || "", 10) || now.getFullYear();

    const payslips = await prisma.payslip.findMany({
      where: { month, year },
      include: { user: true },
    });

    if (!payslips || payslips.length === 0) {
      return c.json(
        { success: false, error: "Chưa có bảng lương chốt cho tháng này" },
        400
      );
    }

    const results = { sent: 0, failed: 0, errors: [] as string[] };

    for (const payslip of payslips) {
      if (!payslip.user?.email) {
        results.failed++;
        results.errors.push(`${payslip.user?.name || "Nhân viên"}: không có email`);
        continue;
      }

      try {
        const content = (payslip.content as any) || {};
        await sendPayslipEmail({
          employeeName: payslip.user.name ?? "Nhân viên",
          employeeEmail: payslip.user.email,
          month,
          year,
          stats: {
            totalHours: content?.totalHours,
            hourlyRate: content?.hourlyRate,
            monthlySalary: content?.monthlySalary,
            employmentType: content?.employmentType,
            totalTaskIncome: content?.totalTaskIncome,
            totalAdjustments: content?.totalAdjustments,
            positiveAdjustments: Array.isArray(content?.adjustments)
              ? content.adjustments.filter((a: any) => a.amount > 0).reduce((sum: number, a: any) => sum + a.amount, 0)
              : 0,
            negativeAdjustments: Array.isArray(content?.adjustments)
              ? content.adjustments.filter((a: any) => a.amount < 0).reduce((sum: number, a: any) => sum + Math.abs(a.amount), 0)
              : 0,
            netSalary: payslip.netSalary,
            bonusAmount: content?.bonusAmount,
            lateCount: content?.lateCount,
            latePenaltyHours: content?.latePenaltyHours,
            latePenaltyAmount: content?.latePenaltyAmount,
          },
        });

        await prisma.payslip.update({
          where: { id: payslip.id },
          data: { emailSentAt: new Date() },
        });

        results.sent++;
        if (process.env.NODE_ENV !== "test") {
          await new Promise((r) => setTimeout(r, 300));
        }
      } catch (e: any) {
        results.failed++;
        results.errors.push(`${payslip.user?.name || "Nhân viên"}: ${e.message}`);
      }
    }

    await invalidateCachePattern("payroll:*");

    return c.json({
      success: true,
      data: results,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Gửi email hàng loạt thất bại" },
      500
    );
  }
});

// ============================================================================
// 9. REPORTS
// ============================================================================
// GET /api/admin/reports
adminRoute.get("/reports", async (c) => {
  try {
    const month =
      parseInt(c.req.query("month") || "", 10) || new Date().getMonth() + 1;
    const year =
      parseInt(c.req.query("year") || "", 10) || new Date().getFullYear();
    const reportData = await getOrSetCache(`admin:reports:${month}:${year}`, 120, async () => {
      const { startDate, endDate } = getVietnamMonthRange(month, year);
      const now = new Date();

      const [users, checkins, pointTasks, carryingTasks, shifts] = await Promise.all([
        prisma.user.findMany({
          where: { isActive: true },
          select: { id: true, name: true, role: true, image: true, employmentType: true },
        }),
        prisma.checkIn.findMany({
          where: { timestamp: { gte: startDate, lte: endDate } },
          include: {
            user: { select: { id: true, name: true, role: true, image: true, employmentType: true } },
          },
        }),
        prisma.userTask.findMany({
          where: {
            status: "APPROVED",
            submittedAt: { gte: startDate, lte: endDate },
            taskDefinition: { unit: "điểm" },
          },
          include: {
            user: { select: { id: true, name: true, role: true, image: true } },
          },
        }),
        prisma.userTask.findMany({
          where: {
            status: "APPROVED",
            submittedAt: { gte: startDate, lte: endDate },
            taskDefinition: { unit: "điểm-bưng" },
          },
          include: {
            user: { select: { id: true, name: true, role: true, image: true } },
          },
        }),
        prisma.workShift.findMany({
          where: { start: { gte: startDate, lte: endDate } },
        }),
      ]);

      const useNewOTRule = year > 2026 || (year === 2026 && month >= 8);
      const excludedNames = useNewOTRule ? ["Nía", "Na"] : ["Nía"];

      // Build shift map
      const shiftMap: Record<string, any> = {};
      for (const s of shifts) {
        const d = toVNDateString(s.start);
        shiftMap[`${s.userId}-${d}`] = s;
      }

      const userDisciplineStats: Record<
        string,
        {
          user: any;
          lateCount: number;
          strictLateCount: number;
          totalLateMinutes: number;
          totalScheduledCheckins: number;
          onTimeCount: number;
          totalEarlyMinutes: number;
        }
      > = {};

      for (const ch of checkins) {
        if (!userDisciplineStats[ch.userId]) {
          userDisciplineStats[ch.userId] = {
            user: ch.user,
            lateCount: 0,
            strictLateCount: 0,
            totalLateMinutes: 0,
            totalScheduledCheckins: 0,
            onTimeCount: 0,
            totalEarlyMinutes: 0,
          };
        }
        const stats = userDisciplineStats[ch.userId];
        const vnTime = new Date(new Date(ch.timestamp).getTime() + VN_OFFSET_MS);
        const dateKey = toVNDateString(ch.timestamp);
        const hour = vnTime.getUTCHours();
        const min = vnTime.getUTCMinutes();
        const timeVal = hour + min / 60;

        const shift = shiftMap[`${ch.userId}-${dateKey}`];

        if (ch.type === "checkin") {
          let expectedStart = 8.5;
          let shouldCheck = false;

          if (shift) {
            const sVn = new Date(new Date(shift.start).getTime() + VN_OFFSET_MS);
            expectedStart = sVn.getUTCHours() + sVn.getUTCMinutes() / 60;
            shouldCheck = true;
          } else if (ch.user?.employmentType === "FULL_TIME") {
            shouldCheck = true;
          }

          if (shouldCheck) {
            stats.totalScheduledCheckins++;
            if (isLate(timeVal, expectedStart)) {
              stats.lateCount++;
              stats.totalLateMinutes += Math.floor((timeVal - expectedStart) * 60);
            } else {
              stats.onTimeCount++;
            }

            if (timeVal > expectedStart) {
              stats.strictLateCount++;
            }

            if (timeVal < expectedStart) {
              stats.totalEarlyMinutes += Math.round((expectedStart - timeVal) * 60);
            }
          }
        }
      }

      const topLate = Object.values(userDisciplineStats)
        .filter((u) => !excludedNames.includes(u.user?.name || "") && u.lateCount > 0)
        .sort((a, b) => b.totalLateMinutes - a.totalLateMinutes)
        .map((u) => ({
          user: { id: u.user.id, name: u.user.name || "Nhân viên" },
          lateCount: u.lateCount,
          totalLateMinutes: u.totalLateMinutes,
        }));

      const topDiscipline = Object.values(userDisciplineStats)
        .filter(
          (u) =>
            !excludedNames.includes(u.user?.name || "") &&
            u.totalScheduledCheckins > 0 &&
            u.strictLateCount === 0
        )
        .map((u) => ({
          id: u.user.id,
          name: u.user.name || "Nhân viên",
          image: u.user.image,
          user: { id: u.user.id, name: u.user.name || "Nhân viên", image: u.user.image },
          totalScheduledCheckins: u.totalScheduledCheckins,
          punctualityRate:
            Math.round(((u.onTimeCount / u.totalScheduledCheckins) * 100) * 10) / 10,
          totalEarlyMinutes: u.totalEarlyMinutes,
        }))
        .sort((a, b) => {
          if (b.punctualityRate === a.punctualityRate) {
            if (b.totalEarlyMinutes === a.totalEarlyMinutes) {
              return b.totalScheduledCheckins - a.totalScheduledCheckins;
            }
            return b.totalEarlyMinutes - a.totalEarlyMinutes;
          }
          return b.punctualityRate - a.punctualityRate;
        })
        .slice(0, 5);

      const payrollSummary = await calculateMonthlyPayrollSummary(
        new Date(year, month - 1, 15)
      ).catch(() => ({
        totalPayroll: 0,
        totalProjected: 0,
        details: [],
      }));

      const totalPayrollCost = payrollSummary?.totalPayroll || 0;
      const totalHoursAll = Array.isArray(payrollSummary?.details)
        ? payrollSummary.details.reduce(
            (acc: number, d: any) => acc + (d.actualHours || 0),
            0
          )
        : 0;

      const activeDetails = Array.isArray(payrollSummary?.details)
        ? payrollSummary.details.filter(
            (d: any) => !excludedNames.includes(d.userName) && d.role !== "ADMIN"
          )
        : [];

      const topHardworking = activeDetails
        .filter((d: any) => d.employmentType !== "FULL_TIME" && (d.actualHours || 0) > 0)
        .slice()
        .sort((a: any, b: any) => (b.actualHours || 0) - (a.actualHours || 0))
        .slice(0, 5)
        .map((d: any) => ({
          id: d.userId,
          name: d.userName,
          totalHours: d.actualHours || 0,
          daysWorked: d.daysWorked || 0,
        }));

      const isCurrentMonth =
        now.getMonth() + 1 === month && now.getFullYear() === year;
      const referenceDay = isCurrentMonth ? now.getDate() : 31;
      let minDays = 1;
      if (referenceDay >= 22) {
        minDays = 16;
      } else if (referenceDay >= 8) {
        minDays = 8;
      }

      const topOvertime = activeDetails
        .filter((d: any) => {
          const otHours = useNewOTRule
            ? (d.leaderboardOvertimeHours ?? d.overtimeHours ?? 0)
            : (d.totalOvertimeHours ?? d.overtimeHours ?? 0);
          return otHours > 0 && (d.daysWorked || 0) >= minDays;
        })
        .map((d: any) => {
          const otHours = useNewOTRule
            ? (d.leaderboardOvertimeHours ?? d.overtimeHours ?? 0)
            : (d.totalOvertimeHours ?? d.overtimeHours ?? 0);
          const days = d.daysWorked || 1;
          return {
            id: d.userId,
            name: d.userName,
            avgOvertime: Math.round((otHours / days) * 10) / 10,
            displayOvertimeHours: Math.round(otHours * 10) / 10,
            daysWorked: days,
          };
        })
        .sort((a, b) => b.avgOvertime - a.avgOvertime)
        .slice(0, 5);

      // Top Packing
      const userPointsMap: Record<
        string,
        { id: string; name: string; image: string | null; points: number }
      > = {};
      for (const pt of pointTasks) {
        if (pt.user?.role === "ADMIN") continue;
        if (!userPointsMap[pt.userId]) {
          userPointsMap[pt.userId] = {
            id: pt.user.id,
            name: pt.user.name || "Nhân viên",
            image: pt.user.image,
            points: 0,
          };
        }
        userPointsMap[pt.userId].points += pt.finalAmount || pt.quantity || 0;
      }
      const topPacking = Object.values(userPointsMap)
        .filter((u) => !excludedNames.includes(u.name))
        .sort((a, b) => b.points - a.points)
        .slice(0, 5);

      // Top Carrying
      const userCarryingMap: Record<
        string,
        { id: string; name: string; image: string | null; points: number }
      > = {};
      for (const ct of carryingTasks) {
        if (ct.user?.role === "ADMIN") continue;
        if (!userCarryingMap[ct.userId]) {
          userCarryingMap[ct.userId] = {
            id: ct.user.id,
            name: ct.user.name || "Nhân viên",
            image: ct.user.image,
            points: 0,
          };
        }
        userCarryingMap[ct.userId].points += ct.finalAmount || ct.quantity || 0;
      }
      const topCarrying = Object.values(userCarryingMap)
        .filter((u) => !excludedNames.includes(u.name) && u.points >= 10)
        .sort((a, b) => b.points - a.points)
        .slice(0, 5);

      return {
        totalPayrollCost,
        totalHoursAll,
        totalEmployeeCount: users.length,
        topHardworking,
        topDiscipline,
        topOvertime,
        topPacking,
        topCarrying,
        topLate,
      };
    });

    return c.json({
      success: true,
      data: reportData,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to generate report" },
      500
    );
  }
});


