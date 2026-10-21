import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks for DB and Cache
// ============================================================================
const {
  mockDocFindMany,
  mockDocFindUnique,
  mockExecuteRawUnsafe,
  mockQueryRaw,
} = vi.hoisted(() => ({
  mockDocFindMany: vi.fn(),
  mockDocFindUnique: vi.fn(),
  mockExecuteRawUnsafe: vi.fn(),
  mockQueryRaw: vi.fn(),
}));

vi.mock("@checkin/db", () => ({
  prisma: {
    document: {
      findMany: mockDocFindMany,
      findUnique: mockDocFindUnique,
    },
    documentChunk: {
      deleteMany: vi.fn(),
    },
    $executeRawUnsafe: mockExecuteRawUnsafe,
    $queryRaw: mockQueryRaw,
  },
}));

vi.mock("../src/lib/cache", () => ({
  checkCacheHealth: vi.fn().mockResolvedValue("connected"),
  getOrSetCache: vi.fn().mockImplementation((_k, _t, fn) => fn()),
  invalidateCachePattern: vi.fn().mockResolvedValue(undefined),
  getRedisClient: vi.fn().mockReturnValue(null), // default in-memory
}));

import { app } from "../src/app";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  normalizeCapyQuery,
  removeVietnameseAccents,
  buildExactCacheKey,
  cosineSimilarity,
  cosineDistance,
  computeRrfScore,
  lookupTier1ExactOrGrep,
  lookupTier2SemanticCache,
  saveToCapyRagCache,
  invalidateCapyRagCache,
  checkHighConfidenceGrepFaq,
  ensurePgvectorHalfvecIndexes,
  hybridSearchDocumentChunksRRF,
  syncDocumentsToMeilisearch,
  searchDocumentsInMeilisearch,
} from "../src/lib/capy-rag-cache";

describe("Trợ lý Capy - 3-Tier Short-Circuit Cascade & pgvector 0.8.7 Superpowers", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await invalidateCapyRagCache("limart");
    mockDocFindMany.mockResolvedValue([]);
    mockQueryRaw.mockResolvedValue([]);
    mockExecuteRawUnsafe.mockResolvedValue(1);
  });

  // ==========================================================================
  // 1. Pure Math, Normalization & RRF Helpers
  // ==========================================================================
  describe("Pure Vector Math & Query Normalization", () => {
    it("normalizeCapyQuery strips punctuation, normalizes NFC, and collapses spaces", () => {
      const input = "  Đi muộn, phạt sao?! (Em hỏi thật) ...  ";
      const normalized = normalizeCapyQuery(input);
      expect(normalized).toBe("đi muộn phạt sao em hỏi thật");
    });

    it("removeVietnameseAccents converts accented Vietnamese to plain ASCII", () => {
      expect(removeVietnameseAccents("Đi trễ phạt bao nhiêu")).toBe("Di tre phat bao nhieu");
      expect(removeVietnameseAccents("Thưởng nóng 200k chuyên cần")).toBe("Thuong nong 200k chuyen can");
    });

    it("buildExactCacheKey creates deterministic SHA-256 prefixed keys", () => {
      const key1 = buildExactCacheKey("di tre phat sao");
      const key2 = buildExactCacheKey("di tre phat sao");
      const key3 = buildExactCacheKey("di tre phat the nao");

      expect(key1).toMatch(/^capy:qa:exact:[a-f0-9]{32}$/);
      expect(key1).toBe(key2);
      expect(key1).not.toBe(key3);
    });

    it("cosineSimilarity and cosineDistance calculate correct geometric proximity", () => {
      const vecA = [1, 0, 0];
      const vecB = [1, 0, 0];
      const vecC = [0, 1, 0];
      const vecD = [0.99, 0.05, 0];

      // Identical
      expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(1.0, 5);
      expect(cosineDistance(vecA, vecB)).toBeCloseTo(0.0, 5);

      // Orthogonal
      expect(cosineSimilarity(vecA, vecC)).toBeCloseTo(0.0, 5);
      expect(cosineDistance(vecA, vecC)).toBeCloseTo(1.0, 5);

      // Near identical (distance < 0.12)
      expect(cosineDistance(vecA, vecD)).toBeLessThan(0.05);
    });

    it("computeRrfScore implements Reciprocal Rank Fusion formula with k = 60", () => {
      // Vector rank 1, keyword rank 1 -> 1/61 + 1/61 = 2/61 ≈ 0.032787
      const scoreBoth = computeRrfScore(1, 1, 60);
      expect(scoreBoth).toBeCloseTo(2 / 61, 5);

      // Vector rank 1 only -> 1/61 ≈ 0.016393
      const scoreVectorOnly = computeRrfScore(1, null, 60);
      expect(scoreVectorOnly).toBeCloseTo(1 / 61, 5);

      // Keyword rank 2 only -> 1/62 ≈ 0.016129
      const scoreKeywordOnly = computeRrfScore(null, 2, 60);
      expect(scoreKeywordOnly).toBeCloseTo(1 / 62, 5);
    });
  });

  // ==========================================================================
  // 2. Tier 1: Canonical Grep FAQ & Exact Cache
  // ==========================================================================
  describe("Tier 1: Canonical Grep FAQ & Exact Cache (1-5ms, 0 API Calls)", () => {
    it("matches canonical SOP intents with both accented and unaccented queries", () => {
      // Intent 1: Late penalty
      expect(checkHighConfidenceGrepFaq("đi muộn phạt sao")?.intent).toBe("late_penalty");
      expect(checkHighConfidenceGrepFaq("di tre tru bao nhieu tien")?.intent).toBe("late_penalty");

      // Intent 2: Hot bonus 200k
      expect(checkHighConfidenceGrepFaq("thưởng nóng 200k")?.intent).toBe("hot_bonus_200k");
      expect(checkHighConfidenceGrepFaq("thuong nong tinh sao")?.intent).toBe("hot_bonus_200k");

      // Intent 3: Lucky Wheel
      expect(checkHighConfidenceGrepFaq("vòng quay may mắn")?.intent).toBe("lucky_wheel");
      expect(checkHighConfidenceGrepFaq("vong quay may man")?.intent).toBe("lucky_wheel");

      // Intent 4: Damaged goods
      expect(checkHighConfidenceGrepFaq("hàng vỡ hỏng xử lý sao")?.intent).toBe("damaged_goods");
      expect(checkHighConfidenceGrepFaq("be hang lam sao")?.intent).toBe("damaged_goods");

      // Intent 5: Shop address & wifi
      expect(checkHighConfidenceGrepFaq("địa chỉ shop ở đâu")?.intent).toBe("shop_address_wifi");
      expect(checkHighConfidenceGrepFaq("mat khau wifi quan")?.intent).toBe("shop_address_wifi");

      // Intent 6: WFH packaging
      expect(checkHighConfidenceGrepFaq("đơn giá đóng gói wfh")?.intent).toBe("wfh_packaging");
      expect(checkHighConfidenceGrepFaq("lam viec tai nha tinh luong sao")?.intent).toBe("wfh_packaging");

      // Intent 7: Explanation request
      expect(checkHighConfidenceGrepFaq("quy trình xin giải trình")?.intent).toBe("explanation_request");
      expect(checkHighConfidenceGrepFaq("quen check out lam sao")?.intent).toBe("explanation_request");

      // Intent 8: Shift registration
      expect(checkHighConfidenceGrepFaq("cách đăng ký lịch làm việc")?.intent).toBe("shift_registration");
      expect(checkHighConfidenceGrepFaq("dang ky ca truc o dau")?.intent).toBe("shift_registration");
    });

    it("lookupTier1ExactOrGrep returns TIER_1_GREP for canonical questions", async () => {
      const result = await lookupTier1ExactOrGrep("đi muộn phạt sao");
      expect(result.hit).toBe(true);
      expect(result.tier).toBe("TIER_1_GREP");
      expect(result.reply).toContain("1 phút");
      expect(result.reply).toContain("Xin giải trình");
    });

    it("lookupTier1ExactOrGrep returns TIER_1_EXACT_CACHE when query is in exact cache", async () => {
      await saveToCapyRagCache({
        userQuery: "Câu hỏi test exact cache",
        answer: "Câu trả lời đã lưu từ trước",
        sources: ["test-source.md"],
        tenantId: "limart",
      });

      const result = await lookupTier1ExactOrGrep("Câu hỏi test exact cache", [], {
        tenantId: "limart",
      });

      expect(result.hit).toBe(true);
      expect(result.tier).toBe("TIER_1_EXACT_CACHE");
      expect(result.reply).toBe("Câu trả lời đã lưu từ trước");
      expect(result.sources).toEqual(["test-source.md"]);
    });

    it("returns TIER_1_GREP instantly via HTTP endpoint with 0 Gemini calls", async () => {
      const res = await app.request("/api/documents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "thưởng nóng 200k" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.tier).toBe("TIER_1_GREP");
      expect(json.cached).toBe(true);
      expect(json.reply).toContain("130 giờ công");
      expect(json.reply).toContain("Vua Đóng Hàng");
    });
  });

  // ==========================================================================
  // 3. Tier 2: Semantic Embedding Response Cache
  // ==========================================================================
  describe("Tier 2: Semantic Embedding Response Cache (~80ms, 0 LLM Calls)", () => {
    it("returns cached answer when cosine distance <= 0.12 (similarity >= 88%)", async () => {
      // 1. Seed Q&A in Tier 2 cache with base embedding
      const baseVector = [0.9, 0.1, 0.05];
      await saveToCapyRagCache({
        userQuery: "Đi muộn bị phạt bao nhiêu tiền?",
        answer: "Đi muộn quá 1 phút sẽ bị tính vào bảng vi phạm tháng và trừ chuyên cần.",
        sources: ["quy-che-di-muon.md"],
        embedding: baseVector,
        tenantId: "limart",
      });

      // 2. Rephrased query with very close semantic vector (cosine distance < 0.12)
      const nearVector = [0.89, 0.12, 0.04];
      const dist = cosineDistance(baseVector, nearVector);
      expect(dist).toBeLessThan(0.12);

      const hit = await lookupTier2SemanticCache(nearVector, "limart", 0.12);
      expect(hit.hit).toBe(true);
      expect(hit.tier).toBe("TIER_2_SEMANTIC_CACHE");
      expect(hit.reply).toBe(
        "Đi muộn quá 1 phút sẽ bị tính vào bảng vi phạm tháng và trừ chuyên cần."
      );
      expect(hit.sources).toEqual(["quy-che-di-muon.md"]);
    });

    it("misses Tier 2 cache when cosine distance > 0.12 (different question)", async () => {
      const baseVector = [0.9, 0.1, 0.05];
      await saveToCapyRagCache({
        userQuery: "Đi muộn bị phạt bao nhiêu tiền?",
        answer: "Phạt đi muộn...",
        sources: ["quy-che-di-muon.md"],
        embedding: baseVector,
        tenantId: "limart",
      });

      // Distant query vector (e.g. asking about Wi-Fi password)
      const distantVector = [0.05, 0.95, 0.1];
      const hit = await lookupTier2SemanticCache(distantVector, "limart", 0.12);
      expect(hit.hit).toBe(false);
    });

    it("serves rephrased query via HTTP at TIER_2_SEMANTIC_CACHE without calling Gemini LLM", async () => {
      // Seed an initial Q&A
      const seedVector = [0.85, 0.2, 0.1];
      await saveToCapyRagCache({
        userQuery: "Quy tắc duyệt xin nghỉ phép",
        answer: "Nhân viên làm đơn xin nghỉ phép trước tối thiểu 24 giờ trên app.",
        sources: ["nghi-phep.md"],
        embedding: seedVector,
        tenantId: "limart",
      });

      const originalKey = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = "mock-gemini-key";

      // Mock Gemini: embedContent returns a vector very close to seedVector,
      // generateContent should NOT be called at all!
      const mockGenerateContent = vi.fn();
      const mockEmbedContent = vi.fn().mockResolvedValue({
        embedding: { values: [0.86, 0.19, 0.09] }, // distance < 0.02
      });

      const spy = vi
        .spyOn(GoogleGenerativeAI.prototype, "getGenerativeModel")
        .mockImplementation(() => ({
          generateContent: mockGenerateContent,
          embedContent: mockEmbedContent,
        }) as any);

      try {
        const res = await app.request("/api/documents/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: "Nghỉ phép cần báo trước bao lâu?" }),
        });

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
        expect(json.tier).toBe("TIER_2_SEMANTIC_CACHE");
        expect(json.cached).toBe(true);
        expect(json.reply).toBe(
          "Nhân viên làm đơn xin nghỉ phép trước tối thiểu 24 giờ trên app."
        );
        expect(json.similarity).toBeGreaterThanOrEqual(0.88);

        // 0 calls to Gemini LLM generation!
        expect(mockGenerateContent).not.toHaveBeenCalled();
        // Only 1 call to embedding
        expect(mockEmbedContent).toHaveBeenCalledTimes(1);
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

  // ==========================================================================
  // 4. Tier 3: LLM Generation & Write-Back
  // ==========================================================================
  describe("Tier 3: Gemini LLM Generation & Write-Back to Tier 1 & Tier 2", () => {
    it("runs Gemini LLM on cache miss and writes back so subsequent identical query hits Tier 1", async () => {
      const originalKey = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = "mock-gemini-key";

      const mockGenerateContent = vi.fn().mockResolvedValue({
        response: { text: () => "Quy định vệ sinh cửa hàng lúc 21h30 đóng cửa." },
      });
      const mockEmbedContent = vi.fn().mockResolvedValue({
        embedding: { values: [0.01, 0.02, 0.98] },
      });

      const spy = vi
        .spyOn(GoogleGenerativeAI.prototype, "getGenerativeModel")
        .mockImplementation(() => ({
          generateContent: mockGenerateContent,
          embedContent: mockEmbedContent,
        }) as any);

      try {
        // First request: Cache Miss -> Tier 3 Gemini LLM
        const res1 = await app.request("/api/documents/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: "Mấy giờ cửa hàng bắt đầu quét dọn vệ sinh?" }),
        });

        expect(res1.status).toBe(200);
        const json1 = await res1.json();
        expect(json1.tier).toBe("TIER_3_GEMINI_LLM");
        expect(json1.cached).toBe(false);
        expect(json1.reply).toContain("21h30 đóng cửa");
        expect(mockGenerateContent).toHaveBeenCalledTimes(1);

        // Second request with exact query: Must hit Tier 1 Exact Cache!
        const res2 = await app.request("/api/documents/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: "Mấy giờ cửa hàng bắt đầu quét dọn vệ sinh?" }),
        });

        expect(res2.status).toBe(200);
        const json2 = await res2.json();
        expect(json2.tier).toBe("TIER_1_EXACT_CACHE");
        expect(json2.cached).toBe(true);
        expect(json2.reply).toContain("21h30 đóng cửa");
        // No additional Gemini LLM calls!
        expect(mockGenerateContent).toHaveBeenCalledTimes(1);
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

  // ==========================================================================
  // 5. Cache Invalidation
  // ==========================================================================
  describe("Admin Document Edit & Cache Invalidation", () => {
    it("invalidateCapyRagCache purges both Tier 1 exact and Tier 2 semantic caches", async () => {
      // 1. Seed Tier 1 and Tier 2
      await saveToCapyRagCache({
        userQuery: "Câu hỏi test invalidate",
        answer: "Câu trả lời cũ",
        sources: ["old-doc.md"],
        embedding: [0.5, 0.5, 0.5],
        tenantId: "limart",
      });

      // Confirm Tier 1 and Tier 2 hit
      const checkTier1Before = await lookupTier1ExactOrGrep(
        "Câu hỏi test invalidate",
        [],
        { tenantId: "limart" }
      );
      expect(checkTier1Before.hit).toBe(true);

      const checkTier2Before = await lookupTier2SemanticCache(
        [0.5, 0.5, 0.5],
        "limart",
        0.12
      );
      expect(checkTier2Before.hit).toBe(true);

      // 2. Invalidate cache
      await invalidateCapyRagCache("limart");

      // 3. Confirm misses
      const checkTier1After = await lookupTier1ExactOrGrep(
        "Câu hỏi test invalidate",
        [],
        { tenantId: "limart" }
      );
      expect(checkTier1After.hit).toBe(false);

      const checkTier2After = await lookupTier2SemanticCache(
        [0.5, 0.5, 0.5],
        "limart",
        0.12
      );
      expect(checkTier2After.hit).toBe(false);
    });
  });

  // ==========================================================================
  // 6. pgvector 0.8.7 Superpowers & Meilisearch Integration
  // ==========================================================================
  describe("pgvector 0.8.7 Superpowers & Safe Meilisearch Helpers", () => {
    it("ensurePgvectorHalfvecIndexes runs safely without throwing", async () => {
      const success = await ensurePgvectorHalfvecIndexes();
      expect(success).toBe(true);
    });

    it("hybridSearchDocumentChunksRRF handles raw chunks gracefully and fuses scores", async () => {
      mockQueryRaw.mockResolvedValueOnce([
        {
          documentId: "doc-1",
          content: "Nội dung quy tắc phạt trễ...",
          path: "quy-che/phat.md",
          title: "Quy tắc phạt",
          distance: 0.15,
        },
      ]);

      const chunks = await hybridSearchDocumentChunksRRF(
        [0.1, 0.2, 0.3],
        "phạt đi muộn",
        5
      );

      expect(chunks.length).toBe(1);
      expect(chunks[0].title).toBe("Quy tắc phạt");
      expect(chunks[0].distance).toBe(0.15);
      expect(chunks[0].rrfScore).toBeGreaterThan(0);
    });

    it("syncDocumentsToMeilisearch and searchDocumentsInMeilisearch handle unconfigured client safely", async () => {
      const syncResult = await syncDocumentsToMeilisearch([]);
      expect(syncResult).toBe(true);

      const emptyQuery = await searchDocumentsInMeilisearch("");
      expect(emptyQuery).toEqual([]);
    });
  });
});
