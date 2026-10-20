import { describe, it, expect, vi, beforeEach } from "vitest";
import { isShiftLocked, toVietnamTime } from "../src/lib/schedule-lock";
import {
  applyLateSchedulePenalty,
  reconcileFalseLateSchedulePenalties,
  getWeekBoundaries,
} from "../src/lib/schedule-penalty";
import { autoScheduleAdminNa } from "../src/lib/auto-schedule";

const {
  mockUserFindUnique,
  mockUserFindFirst,
  mockWorkShiftFindFirst,
  mockWorkShiftFindMany,
  mockWorkShiftCreateMany,
  mockShiftAuditLogFindFirst,
  mockAdjustmentFindFirst,
  mockAdjustmentFindMany,
  mockAdjustmentCreate,
  mockAdjustmentDeleteMany,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockUserFindFirst: vi.fn(),
  mockWorkShiftFindFirst: vi.fn(),
  mockWorkShiftFindMany: vi.fn(),
  mockWorkShiftCreateMany: vi.fn(),
  mockShiftAuditLogFindFirst: vi.fn(),
  mockAdjustmentFindFirst: vi.fn(),
  mockAdjustmentFindMany: vi.fn(),
  mockAdjustmentCreate: vi.fn(),
  mockAdjustmentDeleteMany: vi.fn(),
}));

vi.mock("@checkin/db", () => ({
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
      findFirst: mockUserFindFirst,
    },
    workShift: {
      findFirst: mockWorkShiftFindFirst,
      findMany: mockWorkShiftFindMany,
      createMany: mockWorkShiftCreateMany,
    },
    shiftAuditLog: {
      findFirst: mockShiftAuditLogFindFirst,
    },
    payrollAdjustment: {
      findFirst: mockAdjustmentFindFirst,
      findMany: mockAdjustmentFindMany,
      create: mockAdjustmentCreate,
      deleteMany: mockAdjustmentDeleteMany,
    },
  },
}));

vi.mock("../src/lib/cache", () => ({
  invalidateCachePattern: vi.fn().mockResolvedValue(undefined),
  invalidatePayrollCache: vi.fn().mockResolvedValue(undefined),
  getOrSetCache: vi.fn().mockImplementation((_k, _t, fn) => fn()),
}));

describe("Schedule Rules & Automation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isShiftLocked()", () => {
    it("locks shift if current time is after previous Sunday 00:00 VN", () => {
      // Shift is on Wednesday Oct 7, 2026 (Monday is Oct 5, lock deadline was Sunday Oct 4, 00:00 VN)
      const shiftDate = new Date("2026-10-07T08:00:00.000Z");

      // Now is Monday Oct 5, 2026 10:00 VN => should be locked
      const nowDuringWeek = new Date("2026-10-05T03:00:00.000Z"); // 10:00 GMT+7
      expect(isShiftLocked(shiftDate, nowDuringWeek)).toBe(true);

      // Now is Sunday Oct 4, 2026 01:00 VN => deadline was Oct 4 00:00 VN => already locked
      const nowSundayMorning = new Date("2026-10-03T18:00:00.000Z"); // 01:00 Oct 4 GMT+7
      expect(isShiftLocked(shiftDate, nowSundayMorning)).toBe(true);
    });

    it("does NOT lock shift if current time is before previous Sunday 00:00 VN", () => {
      // Shift is on Wednesday Oct 7, 2026 (lock deadline is Sunday Oct 4, 00:00 VN)
      const shiftDate = new Date("2026-10-07T08:00:00.000Z");

      // Now is Friday Oct 2, 2026 15:00 VN => before Oct 4 00:00 => unlocked
      const nowFriday = new Date("2026-10-02T08:00:00.000Z");
      expect(isShiftLocked(shiftDate, nowFriday)).toBe(false);

      // Now is Saturday Oct 3, 2026 23:59:59 VN => before Oct 4 00:00 => unlocked
      const nowSaturdayNight = new Date("2026-10-03T16:59:59.000Z"); // 23:59:59 GMT+7
      expect(isShiftLocked(shiftDate, nowSaturdayNight)).toBe(false);
    });
  });

  describe("applyLateSchedulePenalty()", () => {
    it("skips penalty if skipPenalty flag is true", async () => {
      const result = await applyLateSchedulePenalty("u1", new Date(), true);
      expect(result.applied).toBe(false);
      expect(mockUserFindUnique).not.toHaveBeenCalled();
    });

    it("skips penalty if user is FULL_TIME or ADMIN", async () => {
      mockUserFindUnique.mockResolvedValueOnce({
        id: "u-admin",
        role: "ADMIN",
        employmentType: "PART_TIME",
      });

      const resAdmin = await applyLateSchedulePenalty("u-admin", new Date());
      expect(resAdmin.applied).toBe(false);

      mockUserFindUnique.mockResolvedValueOnce({
        id: "u-ft",
        role: "STAFF",
        employmentType: "FULL_TIME",
      });

      const resFT = await applyLateSchedulePenalty("u-ft", new Date());
      expect(resFT.applied).toBe(false);
      expect(mockAdjustmentCreate).not.toHaveBeenCalled();
    });

    it("skips penalty if registering on Saturday before Sunday 00:00 VN deadline", async () => {
      mockUserFindUnique.mockResolvedValue({
        id: "u-pt",
        role: "STAFF",
        employmentType: "PART_TIME",
      });

      // Shift is Wednesday Oct 7, 2026 (Monday is Oct 5, deadline is Sunday Oct 4 00:00 VN)
      const shiftDate = new Date("2026-10-07T08:00:00.000Z");
      // Now is Saturday Oct 3, 2026 15:00 VN (before Sunday Oct 4 00:00 VN)
      const nowSaturday = new Date("2026-10-03T08:00:00.000Z");

      const res = await applyLateSchedulePenalty("u-pt", shiftDate, false, nowSaturday);
      expect(res.applied).toBe(false);
      expect(mockAdjustmentCreate).not.toHaveBeenCalled();
    });

    it("skips penalty if staff already has at least 1 shift created before deadline for that week", async () => {
      mockUserFindUnique.mockResolvedValue({
        id: "u-pt",
        role: "STAFF",
        employmentType: "PART_TIME",
      });
      // Found an existing shift registered before deadline
      mockWorkShiftFindFirst.mockResolvedValue({ id: 99, start: new Date("2026-10-06T08:00:00.000Z") });

      const shiftDate = new Date("2026-10-07T08:00:00.000Z");
      // Now is Monday Oct 5 (after deadline)
      const nowMonday = new Date("2026-10-05T08:00:00.000Z");

      const res = await applyLateSchedulePenalty("u-pt", shiftDate, false, nowMonday);
      expect(res.applied).toBe(false);
      expect(mockAdjustmentCreate).not.toHaveBeenCalled();
    });

    it("skips penalty if shifts in that week were scheduled by an ADMIN", async () => {
      mockUserFindUnique.mockResolvedValue({
        id: "u-pt",
        role: "STAFF",
        employmentType: "PART_TIME",
      });
      mockWorkShiftFindFirst.mockResolvedValue(null);
      // Audit log shows Admin scheduled a shift for this user
      mockShiftAuditLogFindFirst.mockResolvedValue({
        id: 1,
        action: "CREATE",
        changedBy: { role: "ADMIN" },
      });

      const shiftDate = new Date("2026-10-07T08:00:00.000Z");
      const nowMonday = new Date("2026-10-05T08:00:00.000Z");

      const res = await applyLateSchedulePenalty("u-pt", shiftDate, false, nowMonday);
      expect(res.applied).toBe(false);
      expect(mockAdjustmentCreate).not.toHaveBeenCalled();
    });

    it("applies 50k penalty when registering late (after Sunday 00:00 VN) without prior shifts", async () => {
      mockUserFindUnique.mockResolvedValue({
        id: "u-pt",
        role: "STAFF",
        employmentType: "PART_TIME",
      });
      mockWorkShiftFindFirst.mockResolvedValue(null);
      mockShiftAuditLogFindFirst.mockResolvedValue(null);
      mockAdjustmentFindFirst.mockResolvedValue(null);
      mockAdjustmentCreate.mockResolvedValue({ id: "adj-1" });

      // Shift is Wednesday Oct 7, 2026 (Monday is Oct 5, deadline Sunday Oct 4 00:00 VN)
      const shiftDate = new Date("2026-10-07T08:00:00.000Z");
      // Now is Sunday Oct 4, 2026 15:00 VN (after Sunday Oct 4 00:00 VN)
      const now = new Date("2026-10-04T08:00:00.000Z");

      const res = await applyLateSchedulePenalty("u-pt", shiftDate, false, now);

      expect(res.applied).toBe(true);
      expect(res.reason).toContain("Phạt đăng ký lịch muộn tuần 05/10 - 11/10");
      expect(mockAdjustmentCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "u-pt",
          amount: -50000,
          reason: expect.stringContaining("Phạt đăng ký lịch muộn"),
        }),
      });
    });

    it("does NOT apply duplicate penalty if one already exists for that week", async () => {
      mockUserFindUnique.mockResolvedValue({
        id: "u-pt",
        role: "STAFF",
        employmentType: "PART_TIME",
      });
      mockWorkShiftFindFirst.mockResolvedValue(null);
      mockShiftAuditLogFindFirst.mockResolvedValue(null);
      mockAdjustmentFindFirst.mockResolvedValue({ id: "existing-adj" });

      const shiftDate = new Date("2026-10-07T08:00:00.000Z");
      const now = new Date("2026-10-04T08:00:00.000Z");

      const res = await applyLateSchedulePenalty("u-pt", shiftDate, false, now);

      expect(res.applied).toBe(false);
      expect(mockAdjustmentCreate).not.toHaveBeenCalled();
    });
  });

  describe("reconcileFalseLateSchedulePenalties()", () => {
    it("deletes false penalty for Quỳnh Anh on week 19/10 - 25/10", async () => {
      mockAdjustmentFindMany.mockResolvedValue([
        {
          id: "adj-qa",
          userId: "qa-id",
          amount: -50000,
          reason: "Phạt đăng ký lịch muộn tuần 19/10 - 25/10",
          date: new Date("2026-10-19T00:00:00.000Z"),
          user: { id: "qa-id", name: "Quỳnh Anh", role: "STAFF" },
        },
      ]);
      mockWorkShiftFindFirst.mockResolvedValue(null);
      mockShiftAuditLogFindFirst.mockResolvedValue(null);
      mockAdjustmentDeleteMany.mockResolvedValue({ count: 1 });

      const res = await reconcileFalseLateSchedulePenalties();

      expect(res.deletedCount).toBe(1);
      expect(mockAdjustmentDeleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["adj-qa"] } },
      });
    });

    it("deletes false penalty if user had a pre-registered shift or admin-created shift", async () => {
      mockAdjustmentFindMany.mockResolvedValue([
        {
          id: "adj-user2",
          userId: "user-2",
          amount: -50000,
          reason: "Phạt đăng ký lịch muộn tuần 05/10 - 11/10",
          date: new Date("2026-10-05T00:00:00.000Z"),
          user: { id: "user-2", name: "Trần Văn B", role: "STAFF" },
        },
      ]);
      // Pre-registered shift exists
      mockWorkShiftFindFirst.mockResolvedValueOnce({ id: 101 });
      mockShiftAuditLogFindFirst.mockResolvedValueOnce(null);
      mockAdjustmentDeleteMany.mockResolvedValue({ count: 1 });

      const res = await reconcileFalseLateSchedulePenalties("user-2");

      expect(res.deletedCount).toBe(1);
      expect(mockAdjustmentDeleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["adj-user2"] } },
      });
    });

    it("preserves legitimate penalty if user had no pre-shift and no admin shift", async () => {
      mockAdjustmentFindMany.mockResolvedValue([
        {
          id: "adj-legit",
          userId: "user-legit",
          amount: -50000,
          reason: "Phạt đăng ký lịch muộn tuần 05/10 - 11/10",
          date: new Date("2026-10-05T00:00:00.000Z"),
          user: { id: "user-legit", name: "Lê Văn C", role: "STAFF" },
        },
      ]);
      mockWorkShiftFindFirst.mockResolvedValue(null);
      mockShiftAuditLogFindFirst.mockResolvedValue(null);

      const res = await reconcileFalseLateSchedulePenalties();

      expect(res.deletedCount).toBe(0);
      expect(mockAdjustmentDeleteMany).not.toHaveBeenCalled();
    });
  });

  describe("autoScheduleAdminNa()", () => {
    it("returns userFound: false if Na is not in database", async () => {
      mockUserFindFirst.mockResolvedValue(null);

      const res = await autoScheduleAdminNa(2);
      expect(res.success).toBe(false);
      expect(res.userFound).toBe(false);
      expect(res.createdCount).toBe(0);
    });

    it("schedules Mon-Sat shifts 09:30-17:30 VN and skips existing ones", async () => {
      mockUserFindFirst.mockResolvedValue({
        id: "na-id",
        name: "Na",
        email: "maithina4040@gmail.com",
        role: "ADMIN",
      });

      // Existing shift for Monday of current week
      mockWorkShiftFindMany.mockResolvedValue([
        {
          id: 1,
          start: new Date(Date.now()), // current day
        },
      ]);
      mockWorkShiftCreateMany.mockResolvedValue({ count: 11 });

      const res = await autoScheduleAdminNa(2);

      expect(res.success).toBe(true);
      expect(res.userFound).toBe(true);
      expect(res.userName).toBe("Na");
      expect(mockWorkShiftCreateMany).toHaveBeenCalled();
      expect(res.createdCount).toBeGreaterThan(0);
    });
  });
});
