import { describe, it, expect } from "vitest";
import {
  computeStaffTaskDateRanges,
  filterStaffTasks,
} from "./staff-task-utils";
import { StaffTask } from "@/types/staff-tasks";

describe("staff-task-utils", () => {
  describe("computeStaffTaskDateRanges", () => {
    it("should compute start and end dates for week and month ranges", () => {
      const ranges = computeStaffTaskDateRanges();
      expect(ranges.thisWeekStart).toBeInstanceOf(Date);
      expect(ranges.thisWeekEnd).toBeInstanceOf(Date);
      expect(ranges.nextWeekStart).toBeInstanceOf(Date);
      expect(ranges.nextWeekEnd).toBeInstanceOf(Date);
      expect(ranges.lastWeekStart).toBeInstanceOf(Date);
      expect(ranges.lastWeekEnd).toBeInstanceOf(Date);
      expect(ranges.thisMonthStart).toBeInstanceOf(Date);
      expect(ranges.thisMonthEnd).toBeInstanceOf(Date);

      // Verify chronology
      expect(ranges.thisWeekStart.getTime()).toBeLessThan(ranges.thisWeekEnd.getTime());
      expect(ranges.lastWeekStart.getTime()).toBeLessThan(ranges.thisWeekStart.getTime());
      expect(ranges.thisWeekEnd.getTime()).toBeLessThan(ranges.nextWeekStart.getTime());
    });
  });

  describe("filterStaffTasks", () => {
    const ranges = computeStaffTaskDateRanges();

    const mockTasks: StaffTask[] = [
      {
        id: "t1",
        title: "Kiểm kho buổi sáng",
        description: "Kiểm tra kệ bánh kẹo",
        status: "OPEN",
        priority: "HIGH",
        frequency: "DAILY",
        assigneeId: "user-1",
        assignee: { name: "An Nguyen" },
        createdAt: new Date().toISOString(),
        startDate: new Date().toISOString(),
      } as any,
      {
        id: "t2",
        title: "Dọn dẹp khu vực quầy",
        description: "Lau dọn sàn",
        status: "COMPLETED",
        priority: "LOW",
        frequency: "DAILY",
        assigneeId: "user-2",
        assignee: { name: "Binh Tran" },
        createdAt: new Date().toISOString(),
        startDate: new Date().toISOString(),
      } as any,
    ];

    it("should return all tasks when filters are set to ALL and search is empty", () => {
      const result = filterStaffTasks(mockTasks, {
        selectedAssignee: "ALL",
        statusFilter: "ALL",
        searchKeyword: "",
        selectedWeekFilter: "ALL",
        ranges,
      });
      expect(result).toHaveLength(2);
    });

    it("should filter by assigneeId", () => {
      const result = filterStaffTasks(mockTasks, {
        selectedAssignee: "user-1",
        statusFilter: "ALL",
        searchKeyword: "",
        selectedWeekFilter: "ALL",
        ranges,
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("t1");
    });

    it("should filter by status", () => {
      const result = filterStaffTasks(mockTasks, {
        selectedAssignee: "ALL",
        statusFilter: "COMPLETED",
        searchKeyword: "",
        selectedWeekFilter: "ALL",
        ranges,
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("t2");
    });

    it("should filter by search keyword in title, description, or assignee name", () => {
      const matchTitle = filterStaffTasks(mockTasks, {
        selectedAssignee: "ALL",
        statusFilter: "ALL",
        searchKeyword: "Kiểm kho",
        selectedWeekFilter: "ALL",
        ranges,
      });
      expect(matchTitle).toHaveLength(1);
      expect(matchTitle[0].id).toBe("t1");

      const matchDesc = filterStaffTasks(mockTasks, {
        selectedAssignee: "ALL",
        statusFilter: "ALL",
        searchKeyword: "Lau dọn",
        selectedWeekFilter: "ALL",
        ranges,
      });
      expect(matchDesc).toHaveLength(1);
      expect(matchDesc[0].id).toBe("t2");

      const matchAssignee = filterStaffTasks(mockTasks, {
        selectedAssignee: "ALL",
        statusFilter: "ALL",
        searchKeyword: "Binh",
        selectedWeekFilter: "ALL",
        ranges,
      });
      expect(matchAssignee).toHaveLength(1);
      expect(matchAssignee[0].id).toBe("t2");
    });

    it("should filter by THIS_WEEK date range", () => {
      const result = filterStaffTasks(mockTasks, {
        selectedAssignee: "ALL",
        statusFilter: "ALL",
        searchKeyword: "",
        selectedWeekFilter: "THIS_WEEK",
        ranges,
      });
      // Both tasks were created at new Date() which falls in THIS_WEEK
      expect(result).toHaveLength(2);
    });
  });
});
