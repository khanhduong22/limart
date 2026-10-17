import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { createApp } from "../src/app";
import { serverTiming } from "../src/middleware/server-timing.middleware";
import { getJitteredTTL, getOrSetCache, inFlightPromises, setRedisClient } from "../src/lib/cache";

describe("Server-Timing Middleware & Jittered Cache TTL Suite", () => {
  describe("1. Server-Timing HTTP Header Middleware", () => {
    const app = createApp();

    it("attaches Server-Timing header to successful GET /health request", async () => {
      const res = await app.request("/health");
      expect(res.status).toBe(200);

      const timingHeader = res.headers.get("Server-Timing");
      expect(timingHeader).toBeDefined();
      expect(timingHeader).toMatch(/^total;dur=\d+(\.\d+)?;desc="Total Hono Request"$/);

      // Verify duration is a valid positive number
      const match = timingHeader?.match(/dur=(\d+(\.\d+)?)/);
      expect(match).not.toBeNull();
      const dur = parseFloat(match![1]);
      expect(dur).toBeGreaterThanOrEqual(0);
    }, 15000);

    it("exposes Server-Timing in Access-Control-Expose-Headers for CORS clients", async () => {
      const res = await app.request("/health", {
        headers: { Origin: "http://localhost:3000" },
      });
      const exposeHeaders = res.headers.get("Access-Control-Expose-Headers");
      expect(exposeHeaders).toBeDefined();
      expect(exposeHeaders).toContain("Server-Timing");
    }, 15000);

    it("attaches Server-Timing header even on 404 Not Found responses", async () => {
      const res = await app.request("/api/non-existent-route-for-timing-test");
      expect(res.status).toBe(404);

      const timingHeader = res.headers.get("Server-Timing");
      expect(timingHeader).toBeDefined();
      expect(timingHeader).toMatch(/^total;dur=\d+(\.\d+)?;desc="Total Hono Request"$/);
    });

    it("appends to existing Server-Timing header if already populated upstream", async () => {
      const testApp = new Hono();
      testApp.use("*", serverTiming());
      testApp.get("/custom", (c) => {
        c.header("Server-Timing", 'db;dur=12.5;desc="Database Query"');
        return c.text("ok");
      });

      const res = await testApp.request("/custom");
      expect(res.status).toBe(200);

      const timingHeader = res.headers.get("Server-Timing");
      expect(timingHeader).toBeDefined();
      expect(timingHeader).toContain('db;dur=12.5;desc="Database Query"');
      expect(timingHeader).toContain('total;dur=');
      expect(timingHeader).toContain('desc="Total Hono Request"');
    });
  });

  describe("2. Jittered TTL Cache Stampede Protection", () => {
    it("produces values strictly within ±15% range for base TTL of 100 seconds", () => {
      const baseTTL = 100;
      const minExpected = 85;
      const maxExpected = 115;
      const results = new Set<number>();

      for (let i = 0; i < 200; i++) {
        const jittered = getJitteredTTL(baseTTL, 0.15);
        expect(jittered).toBeGreaterThanOrEqual(minExpected);
        expect(jittered).toBeLessThanOrEqual(maxExpected);
        results.add(jittered);
      }

      // Assert that random distribution is not degenerate (variance across 200 runs)
      expect(results.size).toBeGreaterThan(1);
    });

    it("produces values strictly within custom jitter ratio (±5%)", () => {
      const baseTTL = 1000;
      const minExpected = 950;
      const maxExpected = 1050;

      for (let i = 0; i < 100; i++) {
        const jittered = getJitteredTTL(baseTTL, 0.05);
        expect(jittered).toBeGreaterThanOrEqual(minExpected);
        expect(jittered).toBeLessThanOrEqual(maxExpected);
      }
    });

    it("returns non-positive baseTTL safely without throwing or NaN", () => {
      expect(getJitteredTTL(0)).toBe(0);
      expect(getJitteredTTL(-10)).toBe(-10);
    });

    describe("getOrSetCache Valkey integration with Jitter", () => {
      let memoryStore: Map<string, string>;
      let mockRedis: any;

      beforeEach(() => {
        inFlightPromises.clear();
        memoryStore = new Map();
        mockRedis = {
          status: "ready",
          get: vi.fn(async (key: string) => memoryStore.get(key) || null),
          setex: vi.fn(async (key: string, _ttl: number, val: string) => {
            memoryStore.set(key, val);
            return "OK";
          }),
        };
        setRedisClient(mockRedis);
      });

      it("automatically applies jittered TTL by default when caching data", async () => {
        const fetcher = vi.fn().mockResolvedValue({ status: "success" });
        await getOrSetCache("test:jitter:default", 300, fetcher);

        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(mockRedis.setex).toHaveBeenCalledTimes(1);

        const ttlArg = mockRedis.setex.mock.calls[0][1];
        // 300 ±15% => [255, 345]
        expect(ttlArg).toBeGreaterThanOrEqual(255);
        expect(ttlArg).toBeLessThanOrEqual(346);
      });

      it("uses exact base TTL when disableJitter is true", async () => {
        const fetcher = vi.fn().mockResolvedValue({ status: "fixed" });
        await getOrSetCache("test:jitter:disabled", 300, fetcher, { disableJitter: true });

        expect(mockRedis.setex).toHaveBeenCalledTimes(1);
        const ttlArg = mockRedis.setex.mock.calls[0][1];
        expect(ttlArg).toBe(300);
      });

      it("applies custom jitterRatio when specified in options", async () => {
        const fetcher = vi.fn().mockResolvedValue({ status: "custom" });
        await getOrSetCache("test:jitter:custom", 500, fetcher, { jitterRatio: 0.1 });

        expect(mockRedis.setex).toHaveBeenCalledTimes(1);
        const ttlArg = mockRedis.setex.mock.calls[0][1];
        // 500 ±10% => [450, 550]
        expect(ttlArg).toBeGreaterThanOrEqual(450);
        expect(ttlArg).toBeLessThanOrEqual(551);
      });
    });
  });
});
