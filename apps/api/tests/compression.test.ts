import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB and external services before importing app
vi.mock("@checkin/db", () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
  },
}));

vi.mock("../src/lib/cache", () => ({
  checkCacheHealth: vi.fn().mockResolvedValue("connected"),
  getOrSetCache: vi.fn().mockImplementation((_k, _t, fn) => fn()),
}));

vi.mock("../src/lib/meilisearch", () => ({
  checkMeiliHealth: vi.fn().mockResolvedValue("connected"),
}));

import { app, createApp } from "../src/app";

describe("HTTP Response Compression Middleware (Gzip / Deflate)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Real Endpoints Compression (/health)", () => {
    it("compresses response with Gzip when Accept-Encoding: gzip is sent", async () => {
      const res = await app.request("/health", {
        headers: {
          "Accept-Encoding": "gzip",
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Encoding")).toBe("gzip");
      expect(res.headers.get("Vary")).toContain("Accept-Encoding");

      // Verify ETag was converted to weak ETag per RFC 7232
      const etag = res.headers.get("ETag");
      expect(etag).toBeTruthy();
      expect(etag).toMatch(/^W\/"[a-f0-9]+"$/);

      // Verify Server-Timing and X-Request-Id are preserved
      expect(res.headers.get("Server-Timing")).toBeDefined();
      expect(res.headers.get("X-Request-Id")).toBeDefined();

      // Decompress and verify JSON payload integrity
      const arrayBuffer = await res.arrayBuffer();
      const decompressedStream = new Response(arrayBuffer).body!.pipeThrough(
        new DecompressionStream("gzip")
      );
      const text = await new Response(decompressedStream).text();
      const data = JSON.parse(text);

      expect(data.status).toBe("ok");
      expect(data.db).toBe("connected");
      expect(data.valkey).toBe("connected");
      expect(data.meilisearch).toBe("connected");
    });

    it("compresses response with Deflate when Accept-Encoding: deflate is sent", async () => {
      const res = await app.request("/health", {
        headers: {
          "Accept-Encoding": "deflate",
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Encoding")).toBe("deflate");
      expect(res.headers.get("Vary")).toContain("Accept-Encoding");

      const arrayBuffer = await res.arrayBuffer();
      const decompressedStream = new Response(arrayBuffer).body!.pipeThrough(
        new DecompressionStream("deflate")
      );
      const text = await new Response(decompressedStream).text();
      const data = JSON.parse(text);

      expect(data.status).toBe("ok");
      expect(data.db).toBe("connected");
    });

    it("serves uncompressed response when no Accept-Encoding header is present", async () => {
      const res = await app.request("/health");

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Encoding")).toBeNull();
      expect(res.headers.get("Vary")).toContain("Accept-Encoding");

      // Strong ETag preserved for uncompressed response
      const etag = res.headers.get("ETag");
      expect(etag).toBeTruthy();
      expect(etag).toMatch(/^"[a-f0-9]+"$/);

      // Directly parseable via res.json() without decompression
      const data = await res.json();
      expect(data.status).toBe("ok");
      expect(data.db).toBe("connected");
    });

    it("serves uncompressed response when Accept-Encoding: identity is sent", async () => {
      const res = await app.request("/health", {
        headers: {
          "Accept-Encoding": "identity",
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Encoding")).toBeNull();
      const data = await res.json();
      expect(data.status).toBe("ok");
    });

    it("does not compress HEAD requests even if Accept-Encoding is specified", async () => {
      const res = await app.request("/health", {
        method: "HEAD",
        headers: {
          "Accept-Encoding": "gzip",
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Encoding")).toBeNull();
    });

    it("compresses error responses (404) while preserving status code and error payload", async () => {
      const res = await app.request("/api/non-existent-endpoint-test", {
        headers: {
          "Accept-Encoding": "gzip",
        },
      });

      expect(res.status).toBe(404);
      expect(res.headers.get("Content-Encoding")).toBe("gzip");

      const arrayBuffer = await res.arrayBuffer();
      const decompressedStream = new Response(arrayBuffer).body!.pipeThrough(
        new DecompressionStream("gzip")
      );
      const text = await new Response(decompressedStream).text();
      const data = JSON.parse(text);

      expect(data.success).toBe(false);
      expect(data.error).toBe("Route not found");
    });
  });

  describe("2. Large JSON Payload Compression Ratio & Parity", () => {
    it("achieves significant payload reduction on large JSON dataset (reports/schedules)", async () => {
      const testApp = createApp();
      const largeRecordCount = 500;
      const largeDataset = Array.from({ length: largeRecordCount }, (_, i) => ({
        id: `emp-${i}`,
        name: `Nhân viên kiểm kê số ${i}`,
        role: "STAFF",
        email: `staff.${i}@limart.khanhdp.com`,
        shift: {
          date: "2026-10-13",
          startTime: "08:00",
          endTime: "16:00",
          duties: ["Khai báo ca", "Kiểm kê kho hàng", "Báo cáo doanh thu cuối ngày"],
        },
        metadata: {
          verified: true,
          score: 95.5 + (i % 5),
          notes: "Ghi chú hoạt động công việc chi tiết trong ngày của nhân viên tại chi nhánh LimArt.",
        },
      }));

      testApp.get("/api/test-large-report", (c) => c.json({ success: true, data: largeDataset }));

      // 1. Uncompressed request
      const rawRes = await testApp.request("/api/test-large-report");
      expect(rawRes.status).toBe(200);
      const rawBytes = (await rawRes.arrayBuffer()).byteLength;

      // 2. Gzip compressed request
      const gzipRes = await testApp.request("/api/test-large-report", {
        headers: { "Accept-Encoding": "gzip" },
      });
      expect(gzipRes.status).toBe(200);
      expect(gzipRes.headers.get("Content-Encoding")).toBe("gzip");
      const gzipBuffer = await gzipRes.arrayBuffer();
      const compressedBytes = gzipBuffer.byteLength;

      // Assert payload reduction (typically > 80% for repetitive JSON)
      const compressionRatio = (1 - compressedBytes / rawBytes) * 100;
      expect(compressedBytes).toBeLessThan(rawBytes);
      expect(compressionRatio).toBeGreaterThan(70);

      // Verify decompressed content parity
      const decompressedStream = new Response(gzipBuffer).body!.pipeThrough(
        new DecompressionStream("gzip")
      );
      const decompressedText = await new Response(decompressedStream).text();
      const parsed = JSON.parse(decompressedText);

      expect(parsed.success).toBe(true);
      expect(parsed.data.length).toBe(largeRecordCount);
      expect(parsed.data[0].id).toBe("emp-0");
      expect(parsed.data[499].id).toBe("emp-499");
    });
  });
});
