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

  describe("POST /api/documents/chat and /api/chat", () => {
    it("returns response from Capy AI query for late check-in", async () => {
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
      expect(json.reply || json.content).toContain("Quy tắc phạt và xử lý đi muộn");
      expect(json.reply || json.content).not.toContain("tab Kho tài liệu");
    }, 15000);

    it("returns comprehensive step-by-step guidance and template for broken goods", async () => {
      mockDocFindMany.mockResolvedValue([
        {
          id: "doc-complaint",
          title: "Bảng hạn mức tự giải quyết khiếu nại",
          path: "quy-che/bang-han-muc.docx",
          content: "Quy định xử lý hàng vỡ, hỏng khi vận chuyển và mức bồi thường.",
        },
      ]);

      const res = await app.request("/api/documents/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: "nếu khách báo hàng bị vỡ thì giải quyết như nào",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      const reply = json.reply || json.content;
      // Must contain step-by-step guidance and message template
      expect(reply).toContain("Quy trình xử lý sự cố hàng bị vỡ / hỏng");
      expect(reply).toContain("Mẫu tin nhắn chuẩn gửi khách");
      expect(reply).not.toContain("Bạn có thể xem chi tiết ở tab 'Kho tài liệu & Quy chế'");
    });

    it("returns store address information and template for store address query without misattributing complaint document", async () => {
      mockDocFindMany.mockResolvedValue([
        {
          id: "doc-complaint",
          title: "Bảng hạn mức tự giải quyết khiếu nại",
          path: "quy-che/bang-han-muc.docx",
          content: "Quy định xử lý hàng vỡ, hỏng khi vận chuyển và mức bồi thường.",
        },
      ]);

      const res = await app.request("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: "khách hỏi địa chỉ shop thì nhắn như nào",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      const reply = json.reply || json.content;
      // Must contain address info and template, NOT complaint limits
      expect(reply).toContain("Thông tin địa chỉ Cửa hàng Họa cụ LimArt");
      expect(reply).toContain("Mẫu tin nhắn chuẩn gửi khách");
      expect(reply).not.toContain("Bảng hạn mức tự giải quyết khiếu nại");
      expect(reply).not.toContain("Bạn có thể xem chi tiết ở tab 'Kho tài liệu & Quy chế'");
    });
  });

  describe("Relevance Scoring & Stopword Filtering", () => {
    it("differentiates between broken goods query and store address query", async () => {
      const { scoreDocuments } = await import("../src/routes/documents.route");

      const docs = [
        {
          id: "doc-complaint",
          title: "Bảng hạn mức tự giải quyết khiếu nại",
          path: "quy-che/bang-han-muc.docx",
          content: "Quy định giải quyết khiếu nại hàng bị vỡ, hỏng hóc hoặc thiếu hàng khi vận chuyển.",
        },
      ];

      // Query 1: broken goods -> should match high score
      const scoredBroken = scoreDocuments("nếu khách báo hàng bị vỡ thì giải quyết như nào", docs);
      expect(scoredBroken.length).toBeGreaterThan(0);
      expect(scoredBroken[0].score).toBeGreaterThanOrEqual(20);

      // Query 2: address -> stopwords (khách, hỏi, thì, nhắn, như, nào) filtered out,
      // words left: "địa", "chỉ", "shop" -> does NOT match doc-complaint
      const scoredAddress = scoreDocuments("khách hỏi địa chỉ shop thì nhắn như nào", docs);
      // Either 0 matches or score < 20
      const validMatches = scoredAddress.filter((d) => d.score >= 20);
      expect(validMatches.length).toBe(0);
    });
  });
});
