import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockDocFindMany,
  mockDocFindUnique,
  mockDocUpsert,
  mockDocDelete,
  mockDocChunkDeleteMany,
  mockExecuteRawUnsafe,
  mockQueryRaw,
} = vi.hoisted(() => ({
  mockDocFindMany: vi.fn(),
  mockDocFindUnique: vi.fn(),
  mockDocUpsert: vi.fn(),
  mockDocDelete: vi.fn(),
  mockDocChunkDeleteMany: vi.fn(),
  mockExecuteRawUnsafe: vi.fn(),
  mockQueryRaw: vi.fn(),
}));

vi.mock("@checkin/db", () => ({
  prisma: {
    document: {
      findMany: mockDocFindMany,
      findUnique: mockDocFindUnique,
      upsert: mockDocUpsert,
      delete: mockDocDelete,
    },
    documentChunk: {
      deleteMany: mockDocChunkDeleteMany,
    },
    $executeRawUnsafe: mockExecuteRawUnsafe,
    $queryRaw: mockQueryRaw,
  },
}));

vi.mock("../src/lib/cache", () => ({
  checkCacheHealth: vi.fn().mockResolvedValue("connected"),
  getOrSetCache: vi.fn().mockImplementation((_k, _t, fn) => fn()),
  invalidateCachePattern: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/lib/meilisearch", () => ({
  checkMeiliHealth: vi.fn().mockResolvedValue("connected"),
}));

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";

describe("Documents Routes", () => {
  let adminToken: string;
  let userToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    adminToken = await signAccessToken({
      sub: "admin-1",
      email: "admin@limart.vn",
      role: "ADMIN",
    });

    userToken = await signAccessToken({
      sub: "user-1",
      email: "user@limart.vn",
      role: "USER",
    });
  });

  describe("GET /api/documents", () => {
    it("returns list of documents with count and data array", async () => {
      mockDocFindMany.mockResolvedValue([
        {
          id: "doc-1",
          title: "Quy tắc phạt đi trễ",
          path: "quy-tac/phat-di-tre",
          content: "Nội dung quy tắc phạt...",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "doc-2",
          title: "Tính lương Full-time",
          path: "luong/tinh-luong-full-time",
          content: "Nội dung tính lương...",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const res = await app.request("/api/documents");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.count).toBe(2);
      expect(json.data.length).toBe(2);
      expect(json.data[0].title).toBe("Quy tắc phạt đi trễ");
    });
  });

  describe("GET /api/documents/:id", () => {
    it("returns single document if found", async () => {
      mockDocFindUnique.mockResolvedValue({
        id: "doc-1",
        title: "Quy tắc phạt đi trễ",
        path: "quy-tac/phat-di-tre",
        content: "Chi tiết...",
      });

      const res = await app.request("/api/documents/doc-1");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe("doc-1");
    });

    it("returns 404 if not found", async () => {
      mockDocFindUnique.mockResolvedValue(null);

      const res = await app.request("/api/documents/not-exist");
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.success).toBe(false);
    });
  });

  describe("POST /api/documents", () => {
    it("requires admin authorization", async () => {
      const res = await app.request("/api/documents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${userToken}`,
        },
        body: JSON.stringify({
          title: "Chính sách mới",
          content: "Nội dung chính sách...",
        }),
      });

      expect(res.status).toBe(403);
    });

    it("allows admin to upload or create document via JSON", async () => {
      mockDocUpsert.mockResolvedValue({
        id: "new-doc-1",
        title: "Chính sách mới",
        path: "uploads/test.md",
        content: "Nội dung chính sách...",
      });

      const res = await app.request("/api/documents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          title: "Chính sách mới",
          content: "Nội dung chính sách kiểm tra...",
          path: "uploads/test.md",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.title).toBe("Chính sách mới");
      expect(mockDocUpsert).toHaveBeenCalled();
    });
  });

  describe("DELETE /api/documents/:id", () => {
    it("requires admin authentication", async () => {
      const res = await app.request("/api/documents/doc-1", {
        method: "DELETE",
        headers: {
          Cookie: `access_token=${userToken}`,
        },
      });

      expect(res.status).toBe(403);
    });

    it("deletes document and chunks when called by admin", async () => {
      mockDocFindUnique.mockResolvedValue({
        id: "doc-1",
        title: "Tài liệu cần xóa",
      });
      mockDocChunkDeleteMany.mockResolvedValue({ count: 5 });
      mockDocDelete.mockResolvedValue({ id: "doc-1" });

      const res = await app.request("/api/documents/doc-1", {
        method: "DELETE",
        headers: {
          Cookie: `access_token=${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(mockDocChunkDeleteMany).toHaveBeenCalledWith({
        where: { documentId: "doc-1" },
      });
      expect(mockDocDelete).toHaveBeenCalledWith({
        where: { id: "doc-1" },
      });
    });
  });

  describe("POST /api/documents/chat", () => {
    it("returns response from Capy AI query", async () => {
      mockDocFindMany.mockResolvedValue([
        {
          id: "doc-1",
          title: "Quy tắc phạt đi muộn",
          path: "quy-tac/phat-di-tre",
          content: "Quy định ân hạn 1 phút cho nhân viên.",
        },
      ]);

      const res = await app.request("/api/documents/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: "Quy định đi muộn như thế nào?",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.reply || json.content).toBeDefined();
    }, 15000);
  });
});
