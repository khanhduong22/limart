import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAllowedIPFindMany } = vi.hoisted(() => ({
  mockAllowedIPFindMany: vi.fn(),
}));

vi.mock("@checkin/db", () => ({
  prisma: {
    allowedIP: {
      findMany: mockAllowedIPFindMany,
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../src/lib/cache", () => ({
  checkCacheHealth: vi.fn().mockResolvedValue("connected"),
  getOrSetCache: vi.fn().mockImplementation((_k, _t, fn) => fn()),
}));

vi.mock("../src/lib/meilisearch", () => ({
  checkMeiliHealth: vi.fn().mockResolvedValue("connected"),
}));

import { app } from "../src/app";

describe("ETag Middleware & HTTP Response Optimization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates an ETag header on GET response", async () => {
    mockAllowedIPFindMany.mockResolvedValue([
      { id: 1, prefix: "192.168.1.", label: "LimArt Office" },
    ]);

    const res = await app.request("/api/ip-status", {
      headers: {
        "x-forwarded-for": "192.168.1.50",
      },
    });

    expect(res.status).toBe(200);
    const etag = res.headers.get("ETag");
    expect(etag).toBeDefined();
    expect(etag).toMatch(/^"[a-f0-9]+"$/);
  });

  it("returns HTTP 304 Not Modified with empty body when If-None-Match matches ETag", async () => {
    mockAllowedIPFindMany.mockResolvedValue([
      { id: 1, prefix: "192.168.1.", label: "LimArt Office" },
    ]);

    // 1. Initial request to fetch data and obtain ETag
    const firstRes = await app.request("/api/ip-status", {
      headers: {
        "x-forwarded-for": "192.168.1.50",
      },
    });

    expect(firstRes.status).toBe(200);
    const etag = firstRes.headers.get("ETag");
    expect(etag).toBeTruthy();

    // 2. Subsequent request sending If-None-Match header
    const cachedRes = await app.request("/api/ip-status", {
      headers: {
        "x-forwarded-for": "192.168.1.50",
        "If-None-Match": etag!,
      },
    });

    expect(cachedRes.status).toBe(304);
    expect(cachedRes.headers.get("ETag")).toBe(etag);
    const bodyText = await cachedRes.text();
    expect(bodyText).toBe("");
  });

  it("returns HTTP 304 Not Modified when If-None-Match is '*'", async () => {
    mockAllowedIPFindMany.mockResolvedValue([
      { id: 1, prefix: "192.168.1.", label: "LimArt Office" },
    ]);

    const res = await app.request("/api/ip-status", {
      headers: {
        "x-forwarded-for": "192.168.1.50",
        "If-None-Match": "*",
      },
    });

    expect(res.status).toBe(304);
    const bodyText = await res.text();
    expect(bodyText).toBe("");
  });

  it("returns HTTP 200 with full payload when If-None-Match does not match", async () => {
    mockAllowedIPFindMany.mockResolvedValue([
      { id: 1, prefix: "192.168.1.", label: "LimArt Office" },
    ]);

    const res = await app.request("/api/ip-status", {
      headers: {
        "x-forwarded-for": "192.168.1.50",
        "If-None-Match": '"outdated-or-different-etag-hash"',
      },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.isAllowed).toBe(true);
  });

  it("preserves GET /health functionality with ETag header", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("ETag")).toBeDefined();

    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.db).toBe("connected");
  });
});
