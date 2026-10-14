import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockUserFindUnique,
  mockTaskDefinitionFindMany,
  mockTaskDefinitionFindUnique,
  mockTaskDefinitionCreate,
  mockTaskDefinitionUpdate,
  mockTaskDefinitionDelete,
  mockUserTaskFindMany,
  mockUserTaskFindUnique,
  mockUserTaskUpdate,
  mockUserTaskCount,
  mockTaskItemCount,
  mockPayrollAdjustmentCreate,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockTaskDefinitionFindMany: vi.fn(),
  mockTaskDefinitionFindUnique: vi.fn(),
  mockTaskDefinitionCreate: vi.fn(),
  mockTaskDefinitionUpdate: vi.fn(),
  mockTaskDefinitionDelete: vi.fn(),
  mockUserTaskFindMany: vi.fn(),
  mockUserTaskFindUnique: vi.fn(),
  mockUserTaskUpdate: vi.fn(),
  mockUserTaskCount: vi.fn(),
  mockTaskItemCount: vi.fn(),
  mockPayrollAdjustmentCreate: vi.fn(),
}));

vi.mock("@checkin/db", () => ({
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
    },
    taskDefinition: {
      findMany: mockTaskDefinitionFindMany,
      findUnique: mockTaskDefinitionFindUnique,
      create: mockTaskDefinitionCreate,
      update: mockTaskDefinitionUpdate,
      delete: mockTaskDefinitionDelete,
    },
    userTask: {
      findMany: mockUserTaskFindMany,
      findUnique: mockUserTaskFindUnique,
      update: mockUserTaskUpdate,
      count: mockUserTaskCount,
    },
    taskItem: {
      count: mockTaskItemCount,
    },
    payrollAdjustment: {
      create: mockPayrollAdjustmentCreate,
    },
    $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
  },
}));

vi.mock("../src/lib/cache", () => ({
  invalidateCachePattern: vi.fn().mockResolvedValue(undefined),
  invalidatePayrollCache: vi.fn().mockResolvedValue(undefined),
  invalidateTaskSummaryCache: vi.fn().mockResolvedValue(undefined),
  getOrSetCache: vi.fn().mockImplementation((_k, _t, fn) => fn()),
}));

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";

describe("Task Definitions & Approval Parity Endpoints", () => {
  let adminToken: string;
  let staffToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    adminToken = await signAccessToken({
      sub: "admin-1",
      email: "admin@example.com",
      role: "ADMIN",
    });

    staffToken = await signAccessToken({
      sub: "staff-1",
      email: "staff@example.com",
      role: "USER",
    });

    mockUserFindUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === "admin-1") {
        return { id: "admin-1", email: "admin@example.com", role: "ADMIN", isActive: true };
      }
      if (where.id === "staff-1") {
        return { id: "staff-1", email: "staff@example.com", role: "USER", isActive: true };
      }
      return null;
    });

    mockUserTaskCount.mockResolvedValue(0);
    mockTaskItemCount.mockResolvedValue(0);
  });

  describe("GET /api/admin/tasks/definitions", () => {
    it("returns 401 without auth", async () => {
      const res = await app.request("/api/admin/tasks/definitions");
      expect(res.status).toBe(401);
    });

    it("returns 403 for non-admin user", async () => {
      const res = await app.request("/api/admin/tasks/definitions", {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      expect(res.status).toBe(403);
    });

    it("returns all task definitions ordered by name asc", async () => {
      const sampleDefinitions = [
        {
          id: "def-1",
          name: "Đóng gói Hộp quà Tết Limited",
          description: "Đóng gói hộp quà",
          baseReward: 3500,
          unit: "hộp",
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "def-2",
          name: "Sản xuất Video ngắn TikTok",
          description: "Quay và dựng video",
          baseReward: 200000,
          unit: "video",
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockTaskDefinitionFindMany.mockResolvedValue(sampleDefinitions);

      const res = await app.request("/api/admin/tasks/definitions", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].name).toBe("Đóng gói Hộp quà Tết Limited");
      expect(mockTaskDefinitionFindMany).toHaveBeenCalledWith({
        orderBy: { name: "asc" },
      });
    });

    it("works via alias /api/tasks/definitions", async () => {
      mockTaskDefinitionFindMany.mockResolvedValue([]);
      const res = await app.request("/api/tasks/definitions", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  describe("POST /api/admin/tasks/definitions", () => {
    it("validates required fields (name, unit, baseReward)", async () => {
      const res = await app.request("/api/admin/tasks/definitions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({ name: "" }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("creates a task definition successfully with active default true", async () => {
      const createdDef = {
        id: "def-new",
        name: "Kiểm đếm pallet hàng hóa",
        description: "Kiểm đếm hàng xuất nhập",
        baseReward: 4000,
        unit: "kiện",
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockTaskDefinitionCreate.mockResolvedValue(createdDef);

      const res = await app.request("/api/admin/tasks/definitions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          name: "Kiểm đếm pallet hàng hóa",
          description: "Kiểm đếm hàng xuất nhập",
          baseReward: 4000,
          unit: "kiện",
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe("def-new");
      expect(mockTaskDefinitionCreate).toHaveBeenCalledWith({
        data: {
          name: "Kiểm đếm pallet hàng hóa",
          description: "Kiểm đếm hàng xuất nhập",
          baseReward: 4000,
          unit: "kiện",
          active: true,
        },
      });
    });
  });

  describe("PATCH /api/admin/tasks/definitions/:id", () => {
    it("returns 404 when task definition does not exist", async () => {
      mockTaskDefinitionFindUnique.mockResolvedValue(null);

      const res = await app.request("/api/admin/tasks/definitions/def-non-existent", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({ active: false }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("toggles active status and updates baseReward", async () => {
      mockTaskDefinitionFindUnique.mockResolvedValue({
        id: "def-1",
        name: "Đóng gói Hộp quà Tết Limited",
        active: true,
      });
      mockTaskDefinitionUpdate.mockResolvedValue({
        id: "def-1",
        name: "Đóng gói Hộp quà Tết Limited (Updated)",
        active: false,
        baseReward: 5000,
      });

      const res = await app.request("/api/admin/tasks/definitions/def-1", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          name: "Đóng gói Hộp quà Tết Limited (Updated)",
          active: false,
          baseReward: 5000,
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.active).toBe(false);
      expect(mockTaskDefinitionUpdate).toHaveBeenCalledWith({
        where: { id: "def-1" },
        data: {
          name: "Đóng gói Hộp quà Tết Limited (Updated)",
          active: false,
          baseReward: 5000,
        },
      });
    });
  });

  describe("DELETE /api/admin/tasks/definitions/:id", () => {
    it("returns 404 if definition does not exist", async () => {
      mockTaskDefinitionFindUnique.mockResolvedValue(null);

      const res = await app.request("/api/admin/tasks/definitions/def-missing", {
        method: "DELETE",
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(404);
    });

    it("rejects deletion with 400 if related tasks exist", async () => {
      mockTaskDefinitionFindUnique.mockResolvedValue({
        id: "def-1",
        _count: { tasks: 5, taskItems: 0 },
      });

      const res = await app.request("/api/admin/tasks/definitions/def-1", {
        method: "DELETE",
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(mockTaskDefinitionDelete).not.toHaveBeenCalled();
    });

    it("deletes definition when no dependencies exist", async () => {
      mockTaskDefinitionFindUnique.mockResolvedValue({
        id: "def-unused",
        _count: { tasks: 0, taskItems: 0 },
      });
      mockTaskDefinitionDelete.mockResolvedValue({ id: "def-unused" });

      const res = await app.request("/api/admin/tasks/definitions/def-unused", {
        method: "DELETE",
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(mockTaskDefinitionDelete).toHaveBeenCalledWith({
        where: { id: "def-unused" },
      });
    });
  });

  describe("Admin Task Review & Approval Parity", () => {
    it("POST /api/admin/tasks/:id/approve approves task and creates payroll adjustment", async () => {
      const mockTask = {
        id: "task-100",
        userId: "staff-1",
        quantity: 10,
        unitPrice: 5000,
        finalAmount: 50000,
        title: "Đóng gói ca sáng",
        note: "Đã hoàn thành xuất sắc",
        submittedAt: new Date("2026-10-06T08:00:00Z"),
        createdAt: new Date("2026-10-06T08:00:00Z"),
        taskDefinition: { name: "Đóng gói Hộp quà", baseReward: 5000 },
      };

      mockUserTaskFindUnique.mockResolvedValue(mockTask);
      mockUserTaskUpdate.mockResolvedValue({
        ...mockTask,
        status: "APPROVED",
        reviewedBy: "admin-1",
      });

      const res = await app.request("/api/admin/tasks/task-100/approve", {
        method: "POST",
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(mockUserTaskUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "task-100" },
          data: expect.objectContaining({
            status: "APPROVED",
            reviewedBy: "admin-1",
            finalAmount: 50000,
          }),
        })
      );
      expect(mockPayrollAdjustmentCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "staff-1",
            amount: 50000,
          }),
        })
      );
    });

    it("POST /api/admin/tasks/:id/reject rejects task with reason note", async () => {
      mockUserTaskUpdate.mockResolvedValue({
        id: "task-101",
        status: "REJECTED",
        reviewedBy: "admin-1",
        adminNote: "Ảnh chụp bằng chứng không rõ nét",
      });

      const res = await app.request("/api/admin/tasks/task-101/reject", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({ reason: "Ảnh chụp bằng chứng không rõ nét" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(mockUserTaskUpdate).toHaveBeenCalledWith({
        where: { id: "task-101" },
        data: expect.objectContaining({
          status: "REJECTED",
          reviewedBy: "admin-1",
          adminNote: "Ảnh chụp bằng chứng không rõ nét",
        }),
      });
    });
  });
});
