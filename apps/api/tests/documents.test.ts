import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockDocFindMany,
  mockDocFindUnique,
  mockDocUpsert,
  mockDocUpdate,
  mockDocDelete,
  mockDocCount,
  mockDocChunkDeleteMany,
  mockExecuteRawUnsafe,
  mockQueryRaw,
} = vi.hoisted(() => ({
  mockDocFindMany: vi.fn(),
  mockDocFindUnique: vi.fn(),
  mockDocUpsert: vi.fn(),
  mockDocUpdate: vi.fn(),
  mockDocDelete: vi.fn(),
  mockDocCount: vi.fn().mockResolvedValue(2),
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
      update: mockDocUpdate,
      delete: mockDocDelete,
      count: mockDocCount,
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

    it("allows admin to upload or create document via JSON and syncs chunks", async () => {
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
      expect(mockDocChunkDeleteMany).toHaveBeenCalledWith({
        where: { documentId: "new-doc-1" },
      });
    });
  });

  describe("PATCH & PUT /api/documents/:id", () => {
    it("allows admin to patch document content and re-syncs DocumentChunk", async () => {
      mockDocFindUnique.mockResolvedValue({
        id: "doc-1",
        title: "Tài liệu gốc",
        content: "Nội dung cũ",
      });
      mockDocUpdate.mockResolvedValue({
        id: "doc-1",
        title: "Tài liệu cập nhật",
        content: "Nội dung mới cập nhật",
      });

      const res = await app.request("/api/documents/doc-1", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          title: "Tài liệu cập nhật",
          content: "Nội dung mới cập nhật",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(mockDocUpdate).toHaveBeenCalledWith({
        where: { id: "doc-1" },
        data: { title: "Tài liệu cập nhật", content: "Nội dung mới cập nhật" },
      });
      expect(mockDocChunkDeleteMany).toHaveBeenCalledWith({
        where: { documentId: "doc-1" },
      });
    });

    it("allows admin to put document content and re-syncs DocumentChunk", async () => {
      mockDocFindUnique.mockResolvedValue({
        id: "doc-2",
        title: "Tài liệu PUT",
        content: "Nội dung PUT cũ",
      });
      mockDocUpdate.mockResolvedValue({
        id: "doc-2",
        title: "Tài liệu PUT mới",
        content: "Nội dung PUT mới",
      });

      const res = await app.request("/api/documents/doc-2", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          title: "Tài liệu PUT mới",
          content: "Nội dung PUT mới",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(mockDocUpdate).toHaveBeenCalledWith({
        where: { id: "doc-2" },
        data: { title: "Tài liệu PUT mới", content: "Nội dung PUT mới" },
      });
      expect(mockDocChunkDeleteMany).toHaveBeenCalledWith({
        where: { documentId: "doc-2" },
      });
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

  describe("generateWithGeminiFallback", () => {
    it("calls gemini-flash-lite-latest first with temperature 1, and falls back to gemini-flash-latest if first fails", async () => {
      const { generateWithGeminiFallback } = await import("../src/routes/documents.route");

      const modelsCreated: Array<{ model: string; systemInstruction: string; generationConfig?: any }> = [];
      const mockGenerateContent = vi
        .fn()
        .mockRejectedValueOnce(new Error("Rate limit or model unavailable"))
        .mockResolvedValueOnce({
          response: {
            text: () => "Fallback response from second model",
          },
        });

      const mockGenAI: any = {
        getGenerativeModel: vi.fn().mockImplementation((opts: any) => {
          modelsCreated.push(opts);
          return {
            generateContent: mockGenerateContent,
          };
        }),
      };

      const result = await generateWithGeminiFallback(
        mockGenAI,
        "System prompt test",
        "User question test"
      );

      expect(result).toBe("Fallback response from second model");
      expect(modelsCreated.length).toBe(2);
      expect(modelsCreated[0].model).toBe("gemini-flash-lite-latest");
      expect(modelsCreated[0].generationConfig).toEqual({ temperature: 1 });
      expect(modelsCreated[1].model).toBe("gemini-flash-latest");
      expect(modelsCreated[1].generationConfig).toEqual({ temperature: 1 });
    });
  });

  describe("POST /api/documents/chat and /api/chat (100% Strict RAG)", () => {
    it("returns full document content from DB without inventing or referring to tab Kho tài liệu", async () => {
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
      const reply = json.reply || json.content;
      expect(reply).toContain("Quy định ân hạn 1 phút cho nhân viên.");
      expect(reply).toContain("Quy tắc phạt đi muộn");
      expect(reply).not.toContain("tab Kho tài liệu");
    });

    it("returns strict not-found message when query has no matching documents in DB (zero hallucination)", async () => {
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
          query: "công thức nấu phở bò truyền thống như thế nào?",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      const reply = json.reply || json.content;
      expect(reply).toContain("chưa có trong kho tài liệu nội bộ trên hệ thống");
      expect(reply).toContain("liên hệ trực tiếp Quản lý cửa hàng hoặc nhờ Admin bổ sung");
      expect(reply).not.toContain("bò");
    });

    it("returns full document content for broken goods when document exists in DB", async () => {
      mockDocFindMany.mockResolvedValue([
        {
          id: "doc-complaint",
          title: "Bảng hạn mức tự giải quyết khiếu nại",
          path: "quy-che/bang-han-muc.docx",
          content: "Quy định xử lý hàng vỡ, hỏng khi vận chuyển: chụp ảnh và gửi bồi thường.",
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
      expect(reply).toContain("Bảng hạn mức tự giải quyết khiếu nại");
      expect(reply).toContain("Quy định xử lý hàng vỡ, hỏng khi vận chuyển: chụp ảnh và gửi bồi thường.");
      expect(reply).not.toContain("tab Kho tài liệu");
    });
  });

  describe("GET & POST /api/documents/reindex", () => {
    it("returns vector embedding stats via GET", async () => {
      mockQueryRaw.mockResolvedValue([
        { total_chunks: 10, embedded_chunks: 10 },
      ]);

      const res = await app.request("/api/documents/reindex", {
        method: "GET",
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.totalChunks).toBe(10);
      expect(json.embeddedChunks).toBe(10);
    });

    it("runs vector reindexing across all documents via POST", async () => {
      mockDocFindMany.mockResolvedValue([
        { id: "doc-1", content: "Nội dung 1" },
        { id: "doc-2", content: "Nội dung 2" },
      ]);
      mockQueryRaw.mockResolvedValue([]);

      const res = await app.request("/api/documents/reindex", {
        method: "POST",
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.totalDocs).toBe(2);
      expect(json.data.syncedDocs).toBe(2);
    });

    it("returns complete details for attendance bonus inquiry (Điều kiện nhận thưởng chuyên cần 200k?)", async () => {
      mockDocFindMany.mockResolvedValue([]);

      const res = await app.request("/api/documents/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: "Điều kiện nhận thưởng chuyên cần 200k?",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      const reply = json.reply || json.content;
      expect(reply).toContain("130 giờ");
      expect(reply).toContain("200.000");
      expect(reply).toContain("Vua Đóng Hàng");
      expect(reply).toContain("bưng hàng lên lầu");
    });

    it("returns complete late check-in rules with 1 minute grace period and 24h explanation", async () => {
      mockDocFindMany.mockResolvedValue([]);

      const res = await app.request("/api/documents/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: "Quy định phạt đi muộn như thế nào?",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      const reply = json.reply || json.content;
      expect(reply).toContain("1 phút");
      expect(reply).toContain("giải trình");
    });

    it("returns complete lucky wheel policy with check-in condition and wheel spin turn", async () => {
      mockDocFindMany.mockResolvedValue([]);

      const res = await app.request("/api/documents/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: "Cách cấp quyền quay Vòng Quay May Mắn?",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      const reply = json.reply || json.content;
      expect(reply).toContain("Check-in");
      expect(reply).toContain("lượt quay");
    });

    it("returns explanation request procedure for 'Quy trình xin giải trình?'", async () => {
      mockDocFindMany.mockResolvedValue([]);

      const res = await app.request("/api/documents/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: "Quy trình xin giải trình?",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      const reply = json.reply || json.content;
      expect(reply).toContain("Xin giải trình");
      expect(reply).toContain("/requests");
      expect(reply).toContain("24 giờ");
    });

    it("returns work schedule and shift swap guidance for 'Cách đăng ký lịch làm việc?'", async () => {
      mockDocFindMany.mockResolvedValue([]);

      const res = await app.request("/api/documents/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: "Cách đăng ký lịch làm việc?",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      const reply = json.reply || json.content;
      expect(reply).toContain("Lịch trực");
      expect(reply).toContain("/schedule");
      expect(reply).toContain("Ca Sáng");
      expect(reply).toContain("Kèo thơm");
    });

    it("injects CORE_OPERATIONAL_KNOWLEDGE into Gemini system instruction when API key is configured", async () => {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const originalKey = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = "mock-gemini-key";

      let capturedSystemInstruction = "";
      const mockGenerateContent = vi.fn().mockResolvedValue({
        response: { text: () => "Câu trả lời từ Gemini đã nhận đủ quy chế 200k" },
      });
      const mockGetGenerativeModel = vi.fn().mockImplementation((opts: any) => {
        if (opts.systemInstruction) {
          capturedSystemInstruction = opts.systemInstruction;
        }
        return {
          generateContent: mockGenerateContent,
          embedContent: vi.fn().mockResolvedValue({
            embedding: { values: [0.1, 0.2, 0.3] },
          }),
        };
      });

      const spy = vi.spyOn(GoogleGenerativeAI.prototype, "getGenerativeModel").mockImplementation(mockGetGenerativeModel);

      try {
        const res = await app.request("/api/documents/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: "Điều kiện nhận thưởng chuyên cần 200k?" }),
        });

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
        expect(capturedSystemInstruction).toContain("CẨM NANG & QUY CHẾ VẬN HÀNH CƠ SỞ (BASELINE KNOWLEDGE):");
        expect(capturedSystemInstruction).toContain("130 giờ công");
        expect(capturedSystemInstruction).toContain("+200.000 ₫");
        expect(capturedSystemInstruction).toContain("TUYỆT ĐỐI KHÔNG từ chối hoặc nói chưa có tài liệu");
      } finally {
        spy.mockRestore();
        if (originalKey !== undefined) {
          process.env.GEMINI_API_KEY = originalKey;
        } else {
          delete process.env.GEMINI_API_KEY;
        }
      }
    });
  });

  describe("CORE_OPERATIONAL_KNOWLEDGE and getKeywordFallbackContext", () => {
    it("contains all core operational rules in CORE_OPERATIONAL_KNOWLEDGE", async () => {
      const { CORE_OPERATIONAL_KNOWLEDGE } = await import("../src/routes/documents.route");
      expect(CORE_OPERATIONAL_KNOWLEDGE).toContain("130 giờ công");
      expect(CORE_OPERATIONAL_KNOWLEDGE).toContain("+200.000 ₫");
      expect(CORE_OPERATIONAL_KNOWLEDGE).toContain("Vua Đóng Hàng");
      expect(CORE_OPERATIONAL_KNOWLEDGE).toContain("bưng hàng lên lầu");
      expect(CORE_OPERATIONAL_KNOWLEDGE).toContain("1 phút");
      expect(CORE_OPERATIONAL_KNOWLEDGE).toContain("Xin giải trình");
      expect(CORE_OPERATIONAL_KNOWLEDGE).toContain("Check-in");
      expect(CORE_OPERATIONAL_KNOWLEDGE).toContain("Vòng quay");
      expect(CORE_OPERATIONAL_KNOWLEDGE).toContain("8h30 - 21h30");
      expect(CORE_OPERATIONAL_KNOWLEDGE).toContain("unboxing");
      expect(CORE_OPERATIONAL_KNOWLEDGE).toContain("Lịch trực");
      expect(CORE_OPERATIONAL_KNOWLEDGE).toContain("Kèo thơm");
    });

    it("extracts relevant keyword fallback context for queries", async () => {
      const { getKeywordFallbackContext } = await import("../src/routes/documents.route");
      const bonusContext = getKeywordFallbackContext("Điều kiện nhận thưởng chuyên cần 200k?");
      expect(bonusContext).toContain("130 giờ công");
      expect(bonusContext).toContain("200.000");
      expect(bonusContext).toContain("Vua Đóng Hàng");
      expect(bonusContext).toContain("bưng hàng lên lầu");

      const lateContext = getKeywordFallbackContext("Quy định đi muộn");
      expect(lateContext).toContain("1 phút");
      expect(lateContext).toContain("giải trình");

      const wheelContext = getKeywordFallbackContext("Vòng quay may mắn");
      expect(wheelContext).toContain("Check-in");
      expect(wheelContext).toContain("lượt quay");

      const explainContext = getKeywordFallbackContext("Quy trình xin giải trình?");
      expect(explainContext).toContain("Xin giải trình");
      expect(explainContext).toContain("/requests");

      const scheduleContext = getKeywordFallbackContext("Cách đăng ký lịch làm việc?");
      expect(scheduleContext).toContain("Lịch trực");
      expect(scheduleContext).toContain("/schedule");
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
      const validMatches = scoredAddress.filter((d) => d.score >= 20);
      expect(validMatches.length).toBe(0);
    });
  });
});
